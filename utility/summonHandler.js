const axios = require('axios');
const getTierEmoji = require('./getTierEmoji');

// Use a Map to track processed edits with a TTL
const processedEdits = new Map();

// Clean up old entries every hour
setInterval(() => {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    for (const [key, timestamp] of processedEdits.entries()) {
        if (timestamp < oneHourAgo) {
            processedEdits.delete(key);
        }
    }
}, 60 * 60 * 1000);

async function getCardInfo(cardId, client) {
    try {
        const response = await axios.get(`https://api.mazoku.cc/api/get-inventory-items-by-card/${cardId}`);
        const data = response.data;
        if (data && data.length > 0) {
            const card = data[0].card;
            // Get wishlist count from database
            const wishlistCount = await client.database.getCardWishlistCount(cardId);
            return {
                name: card.name,
                series: card.series,
                tier: card.tier,
                versions: await getAvailableVersions(data, card.tier),
                wishlistCount: wishlistCount || 0
            };
        }
    } catch (error) {
        console.error('Error fetching card info:', error);
    }
    return null;
}

function getAvailableVersions(cardData, tier) {
    const totalVersions = {
        'C': 1000,
        'R': 500,
        'SR': 200,
        'SSR': 100
    };

    if (!cardData || !cardData.length) return { 
        availableVersions: [], 
        remainingVersions: totalVersions[tier]
    };
    
    const existingVersions = new Set(cardData.map(item => item.version));
    const availableVersions = [];
    
    // Find all available versions
    for (let i = 1; i <= totalVersions[tier]; i++) {
        if (!existingVersions.has(i)) {
            availableVersions.push(i);
            if (availableVersions.length >= 5) break;
        }
    }
    
    // Calculate remaining versions (total - claimed - shown)
    const remainingVersions = totalVersions[tier] - existingVersions.size - availableVersions.length;
    
    return { 
        availableVersions, 
        remainingVersions
    };
}

async function getOrCreateHighTierRole(guild) {
    try {
        let role = guild.roles.cache.find(r => r.id === '1305567492277796908' || r.name === 'High-Tier-Ping');
        if (!role) {
            role = await guild.roles.fetch('1305567492277796908').catch(() => null);
            if (!role) {
                role = await guild.roles.create({
                    name: 'High-Tier-Ping',
                    reason: 'Created for High-Tier-Ping cardnotifications'
                });
            }
        }
        return role;
    } catch (error) {
        console.error('Error managing High-Tier-Ping role:', error);
        return null;
    }
}

async function buildCardDescription(cardIds, client) {
    let hasHighTierCard = false;
    let description = '';
    let lastTier = null;
    const letters = [':regional_indicator_a:', ':regional_indicator_b:', ':regional_indicator_c:'];
    
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
                ? `\`Versions Available:\` ${cardInfo.versions.availableVersions.map(version => `*__${version}__*`).join(', ')}` 
                : "**No versions available**";
            
            const remainingText = cardInfo.versions.remainingVersions > 0 
                ? ` \`+${cardInfo.versions.remainingVersions}\`` 
                : '';

            const wishlistCount = cardInfo.wishlistCount > 0 ? ` ${cardInfo.wishlistCount}` : '';
            
            description += `${letters[i]} ${tierEmoji} **${cardInfo.name}** *${cardInfo.series}* \n${versionsText}${remainingText}${wishlistCount ? ` ❤️${wishlistCount}` : ''}\n`;
        }
    }
    
    return { description, hasHighTierCard, tier: lastTier };
}

async function handleSummonInfo(client, newMessage, newEmbed, messageId) {
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
    
    if (!processedEdits.has(messageId) && newEmbed.image && newEmbed.image.url.includes('cdn.mazoku.cc/packs')) {
        // Mark this message as processed
        processedEdits.set(messageId, Date.now());

        const urlParts = newEmbed.image.url.split('/');
        const cardIds = urlParts.slice(4, 7);

        const allowRolePing = serverSettings?.settings?.allowRolePing ?? false;

        // Wait for all card info and build description
        const { description, hasHighTierCard } = await buildCardDescription(cardIds, client);

        // Determine elapsed time since message detection
        const elapsedTime = Math.floor(Date.now() / 1000) - startTime;

        // Calculate countdown time by subtracting the elapsed time from the desired countdown
        const countdownTime = startTime + 20 - elapsedTime;
        const nextSummonTime = startTime + 120 - elapsedTime;

        // Create base embed with countdown
        const countdownEmbed = {
            title: 'Summon Information',
            fields: [
                {
                    name: 'Claim Time',
                    value: `<t:${countdownTime}:R> 📵`
                }
            ],
            color: 0x0099ff
        };

        let roleContent = '';
        let roleId = null;

        // Add description to embed if role pinging is allowed
        if (description && allowRolePing) {
            countdownEmbed.description = description;
        }

        // Only add role ping if allowRolePing is true AND there's a high tier card
        if (guildId === GATE_GUILD && hasHighTierCard) {
            console.log("Attempting to get High Tier Role");
            const highTierRole = await getOrCreateHighTierRole(newMessage.guild);
            if (highTierRole) {
                roleContent = `<@&${highTierRole.id}>`;
                roleId = highTierRole.id;
                console.log(`High Tier Role Found: ${highTierRole.name} (${highTierRole.id})`);
            } else {
                console.log("Failed to get or create High Tier Role");
            }
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
                    name: 'Next Summon',
                    value: `<t:${nextSummonTime}:R> 📵`
                };
                await countdownMsg.edit({
                    content: roleContent,
                    embeds: [countdownEmbed],
                    allowedMentions: { roles: roleId ? [roleId] : [] }
                });
            } catch (error) {
                console.error('Error editing countdown message:', error);
            }
        }, (20 - elapsedTime) * 1000);
    }
}

module.exports = {
    handleSummonInfo,
    processedEdits
};
