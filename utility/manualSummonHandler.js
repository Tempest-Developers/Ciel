const axios = require('axios');
const getTierEmoji = require('./getTierEmoji');

// Use a Map to track processed manual edits with a TTL
const processedManualEdits = new Map();

// Clean up old entries every hour
setInterval(() => {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    for (const [key, timestamp] of processedManualEdits.entries()) {
        if (timestamp < oneHourAgo) {
            processedManualEdits.delete(key);
        }
    }
}, 60 * 60 * 1000);

// Function to handle Mazoku API errors
const handleMazokuAPICall = async (apiCall) => {
    try {
        const response = await apiCall();
        return response;
    } catch (error) {
        console.error('Mazoku API Error:', error);
        if (error.response) {
            const status = error.response.status;
            if (status === 400 || status === 404 || status === 500) {
                throw new Error("The Mazoku Servers are currently unavailable. Please try again later.");
            }
        }
        throw error;
    }
};

async function getCardInfo(cardId, client) {
    try {
        const response = await handleMazokuAPICall(() => 
            axios.get(`https://api.mazoku.cc/api/get-inventory-items-by-card/${cardId}`)
        );
        const data = response.data;
        if (data && data.length > 0) {
            const card = data[0].card;
            // Get wishlist count from database
            const wishlistCount = await client.database.getCardWishlistCount(cardId);
            return {
                name: card.name || '*Data Unavailable*',
                series: card.series || '*Data Unavailable*',
                tier: card.tier,
                versions: await getAvailableVersions(data, card.tier),
                wishlistCount: wishlistCount || 0
            };
        }
    } catch (error) {
        if (error.message === "The Mazoku Servers are currently unavailable. Please try again later.") {
            throw error;
        }
        console.error('Error fetching card info:', error);
        return {
            name: '*Data Unavailable*',
            series: '*Data Unavailable*',
            tier: 'Unknown',
            versions: { availableVersions: [], remainingVersions: 0 },
            wishlistCount: 0
        };
    }
    return null;
}

function getAvailableVersions(cardData, tier) {
    const totalVersions = {
        'C': 2000,
        'R': 750,
        'SR': 250,
        'SSR': 100
    };

    if (!cardData || !cardData.length) return { 
        availableVersions: [], 
        remainingVersions: totalVersions[tier] || 0
    };
    
    const existingVersions = new Set(cardData.map(item => item.version));
    const availableVersions = [];
    
    // Find all available versions
    for (let i = 1; i <= (totalVersions[tier] || 0); i++) {
        if (!existingVersions.has(i)) {
            availableVersions.push(i);
            if (availableVersions.length >= 4) break;
        }
    }
    
    // Calculate remaining versions (total - claimed - shown)
    const remainingVersions = (totalVersions[tier] || 0) - existingVersions.size - availableVersions.length;
    
    return { 
        availableVersions, 
        remainingVersions
    };
}

async function buildCardDescription(cardIds, client) {
    let hasHighTierCard = false;
    let description = '';
    let lastTier = null;
    const letters = [':regional_indicator_a:', ':regional_indicator_b:', ':regional_indicator_c:', ':regional_indicator_d:'];
    
    try {
        // Get card info for all cards at once
        const cardInfoResults = await Promise.all(cardIds.map(id => getCardInfo(id, client)));
        
        // Build description
        for (let i = 0; i < cardInfoResults.length; i++) {
            const cardInfo = cardInfoResults[i];
            const tierList = ['SR', 'SSR'];
            if (cardInfo) {
                if (tierList.includes(cardInfo.tier)) {
                    hasHighTierCard = true;
                }
                lastTier = cardInfo.tier;
                const tierEmoji = getTierEmoji(cardInfo.tier + 'T');
                
                const versionsText = cardInfo.versions.availableVersions.length > 0 
                    ? `\`Ver:\` ${cardInfo.versions.availableVersions.map(version => `*__${version}__*`).join(', ')}` 
                    : "**No versions available**";
                
                const remainingText = cardInfo.versions.remainingVersions > 0 
                    ? ` \`+${cardInfo.versions.remainingVersions} ver left\`` 
                    : '';

                const wishlistCount = cardInfo.wishlistCount;
                const seriesName = cardInfo.series.length > 25 ? cardInfo.series.substring(0, 25)+"..." : cardInfo.series;
                
                description += `${letters[i]} \`❤️ ${wishlistCount}\` ${tierEmoji} **${cardInfo.name}** *${seriesName}*\n${versionsText}${remainingText} \n`;
            }
        }
    } catch (error) {
        if (error.message === "The Mazoku Servers are currently unavailable. Please try again later.") {
            description = error.message;
        } else {
            console.error('Error building card description:', error);
            description = '*Data Unavailable*';
        }
    }
    
    return { description, hasHighTierCard, tier: lastTier };
}

async function handleManualSummonInfo(client, newMessage, newEmbed, messageId) {
    const GATE_GUILD = '1240866080985976844';
    const guildId = newMessage.guild.id;

    // Capture the timestamp when the message is detected
    const startTime = Math.floor(Date.now() / 1000);

    // Get server data for settings check
    let serverData = await client.database.getServerData(guildId);
    if (!serverData) {
        await client.database.createServer(guildId);
        serverData = await client.database.getServerData(guildId);
    }

    // Get server settings
    let serverSettings = await client.database.getServerSettings(guildId);
    if (!serverSettings) {
        await client.database.createServerSettings(guildId);
        serverSettings = await client.database.getServerSettings(guildId);
    }

    if (!processedManualEdits.has(messageId) && newEmbed.image && newEmbed.image.url.includes('cdn.mazoku.cc/packs')) {
        // Mark this message as processed
        processedManualEdits.set(messageId, Date.now());

        const urlParts = newEmbed.image.url.split('/');
        const cardIds = urlParts.slice(4);

        const allowRolePing = serverSettings?.settings?.allowRolePing ?? false;

        try {
            // Wait for all card info and build description
            const { description, hasHighTierCard } = await buildCardDescription(cardIds, client);

            // Determine elapsed time since message detection
            const elapsedTime = Math.floor(Date.now() / 1000) - startTime;

            // Calculate countdown times by subtracting the elapsed time from the intended durations
            const countdownTime = startTime + 18 - elapsedTime;
            const nextSummonTime = startTime + 1780 - elapsedTime;

            // Create base embed with countdown
            const countdownEmbed = {
                title: 'Manual Summon Information',
                fields: [
                    {
                        name: `Claim Time <t:${countdownTime}:R> 📵`,
                        value: `🌟 \`/help\` to see all commands`
                    }
                ],
                color: 0x0099ff,
            };

            let roleContent = '';
            let roleId = null;

            // Add description to embed if role pinging is allowed
            if (description && allowRolePing) {
                countdownEmbed.description = description;
            }

            // Send countdown message
            const countdownMsg = await newMessage.reply({
                content: roleContent,
                embeds: [countdownEmbed],
                allowedMentions: { roles: roleId ? [roleId] : [] }
            });

            // Update to next summon time
            setTimeout(async () => {
                try {
                    countdownEmbed.fields[0] = {
                        name: `Next Manual Summon <t:${nextSummonTime}:R> 📵`,
                        value: `🌟 \`/help\` to see all commands`
                    };
                    await countdownMsg.edit({
                        content: roleContent,
                        embeds: [countdownEmbed],
                        allowedMentions: { roles: roleId ? [roleId] : [] }
                    });
                } catch (error) {
                    console.error('Error editing countdown message:', error);
                }
            }, (16 - elapsedTime) * 1000);
        } catch (error) {
            console.error('Error in handleManualSummonInfo:', error);
            if (error.message === "The Mazoku Servers are currently unavailable. Please try again later.") {
                await newMessage.reply(error.message);
            } else {
                await newMessage.reply('*Data Unavailable*');
            }
        }
    }
}

module.exports = {
    handleManualSummonInfo,
    processedManualEdits
};
