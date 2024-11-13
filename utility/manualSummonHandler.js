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

async function getCardInfo(cardId) {
    try {
        const response = await axios.get(`https://api.mazoku.cc/api/get-inventory-items-by-card/${cardId}`);
        const data = response.data;
        if (data && data.length > 0) {
            const card = data[0].card;
            return {
                name: card.name,
                series: card.series,
                tier: card.tier,
                versions: await getAvailableVersions(data, card.tier)
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

async function buildCardDescription(cardIds) {
    let hasHighTierCard = false;
    let description = '';
    let lastTier = null;
    const letters = [':regional_indicator_a:', ':regional_indicator_b:', ':regional_indicator_c:', ':regional_indicator_d:'];
    
    // Get card info for all cards at once
    const cardInfoResults = await Promise.all(cardIds.map(id => getCardInfo(id)));
    
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
            
            description += `${letters[i]} ${tierEmoji} **${cardInfo.name}** *${cardInfo.series}* \n${versionsText}${remainingText}\n`;
        }
    }
    
    return { description, hasHighTierCard, tier: lastTier };
}

async function handleManualSummonInfo(client, newMessage, newEmbed, messageId) {
    const GATE_GUILD = '1240866080985976844';
    const guildId = newMessage.guild.id;

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
    
    // Calculate timestamps
    const countdownTime = Math.floor(Date.now() / 1000) + 13;
    const nextSummonTime = Math.floor(Date.now() / 1000) + 1780;

    // Only proceed if we haven't processed this message ID and it contains a card pack image
    if (!processedManualEdits.has(messageId) && newEmbed.image && newEmbed.image.url.includes('cdn.mazoku.cc/packs')) {
        // Mark this message as processed
        processedManualEdits.set(messageId, Date.now());

        // Create base embed with countdown
        const countdownEmbed = {
            title: 'Manual Summon Information',
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

        const urlParts = newEmbed.image.url.split('/');
        // Get all card IDs after 'packs' in the URL
        const cardIds = urlParts.slice(4);

        const allowRolePing = serverSettings?.settings?.allowRolePing ?? false;

        // Wait for all card info and build description
        const { description, hasHighTierCard } = await buildCardDescription(cardIds);

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

        // Update to next summon time after 19 seconds
        setTimeout(async () => {
            try {
                countdownEmbed.fields[0] = {
                    name: 'Next Manual Summon can be claimed',
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
        }, 16000);
    }
}

module.exports = {
    handleManualSummonInfo,
    processedManualEdits
};
