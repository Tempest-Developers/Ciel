require('dotenv').config();
const findUserId = require('../utility/findUserId');
const getTierEmoji = require('../utility/getTierEmoji');
const axios = require('axios');

const GATE_GUILD = '1240866080985976844';

// Use a Map to track processed claims with a TTL
const processedClaims = new Map();
const processedEdits = new Map();

// Clean up old entries every hour
setInterval(() => {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    for (const [key, timestamp] of processedClaims.entries()) {
        if (timestamp < oneHourAgo) {
            processedClaims.delete(key);
        }
    }
    for (const [key, timestamp] of processedEdits.entries()) {
        if (timestamp < oneHourAgo) {
            processedEdits.delete(key);
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
                versions: await getAvailableVersions(data)
            };
        }
    } catch (error) {
        console.error('Error fetching card info:', error);
    }
    return null;
}

function getAvailableVersions(cardData) {
    if (!cardData || !cardData.length) return { 
        leastVersions: [], 
        totalVersions: {
            'C': 1000,
            'R': 500,
            'SR': 200,
            'SSR': 100
        }
    };
    
    const existingVersions = cardData.map(item => item.version);
    const missingVersions = [];
    const totalVersions = {
        'C': 1000,
        'R': 500,
        'SR': 200,
        'SSR': 100
    };
    
    // Find the 5 least versions available
    for (let i = 1; i <= 10; i++) {
        if (!existingVersions.includes(i) && missingVersions.length < 5) {
            missingVersions.push(i);
        }
    }
    
    return { 
        leastVersions: missingVersions, 
        totalVersions 
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

async function buildCardDescription(cardIds) {
    let hasHighTierCard = false;
    let description = '';
    let lastTier = null;
    const letters = [':regional_indicator_a:', ':regional_indicator_b:', ':regional_indicator_c:'];
    
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
            
            // Format versions and total versions
            const versionsText = cardInfo.versions.leastVersions.length > 0 
                ? `**Lower Versions Available:** ${cardInfo.versions.leastVersions.map(version => `*__${version}__*`).join(', ')}` 
                : "**No lower versions available**";
            
            const totalVersionsText = `\n**Total Versions:** C: ${cardInfo.versions.totalVersions.C}, R: ${cardInfo.versions.totalVersions.R}, SR: ${cardInfo.versions.totalVersions.SR}, SSR: ${cardInfo.versions.totalVersions.SSR}`;
            
            description += `${letters[i]} ${tierEmoji} **${cardInfo.name}** *${cardInfo.series}* \n${versionsText}${totalVersionsText}\n`;
        }
    }
    
    return { description, hasHighTierCard, tier: lastTier };
}

// Rest of the file remains the same...
module.exports = async (client, oldMessage, newMessage, exemptBotId) => {
    // ... (rest of the existing code remains unchanged)
}
