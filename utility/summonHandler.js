const axios = require('axios');
const getTierEmoji = require('./getTierEmoji');
const { cacheCardData, getCachedCardData } = require('../database/modules/mCards');

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

const MAX_ATTEMPTS = 1;

async function getInventoryItemsByCard(cardId) {
  let attempts = 0;
  let response;

  while (attempts < MAX_ATTEMPTS) {
    try {
      response = await handleMazokuAPICall(() =>
        axios.get(`https://api.mazoku.cc/api/get-inventory-items-by-card/${cardId}`)
      );
      break; // Exits the loop on success
    } catch (error) {
      attempts++;
      // You can add some logging or error handling here
      console.error(`Attempt ${attempts} failed:`, error);
    }
  }

  return attempts < MAX_ATTEMPTS ? response : null; // Return null on max attempts exceeded
}

async function getCardInfo(cardId, client) {
    try {
        // Check if card data is cached and not older than 24 hours
        const cachedCardInfo = await getCachedCardData(cardId);
        if (cachedCardInfo) {
            return cachedCardInfo;
        }

        // If not cached, fetch from API
        const response = await getInventoryItemsByCard(cardId);
        const data = response.data?response.data:null;
        if (data && data.length > 0) {
            const card = data[0].card;
            // Get wishlist count from database
            const wishlistCount = await client.database.getCardWishlistCount(cardId);
            const cardInfo = {
                name: card.name || '*Data Unavailable*',
                series: card.series || '*Data Unavailable*',
                tier: card.tier,
                batchID: card.batchId,
                cardLink: `https://mazoku.cc/card/${cardId}`,
                versions: await getAvailableVersions(data, card.tier),
                wishlistCount: wishlistCount || 0
            };

            // Cache the card data
            await cacheCardData(cardId, cardInfo);

            return cardInfo;
        }
    } catch (error) {
        if (error.message === "The Mazoku Servers are currently unavailable. Please try again later.") {
            throw error;
        }
        console.error('Error fetching card info:', error);
        return {
            name: '*Data Unavailable*',
            series: '',
            tier: 'Unknown',
            batchID: '0',
            cardLink: `undefined`,
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

async function buildCardDescription(cardIds, client, message, guildId, allowRolePing) {
    let hasHighTierCard = false;
    let description = '';
    let lastTier = null;
    let hasPinged = false;
    const letters = [':regional_indicator_a:', ':regional_indicator_b:', ':regional_indicator_c:'];
    const GATE_GUILD = '1240866080985976844';
    
    try {
        // Get card info for all cards at once
        const cardInfoResults = await Promise.all(
            cardIds.map(async id => {
                const result = await getCardInfo(id, client);
                if (result === null) {
                    throw new Error(`Failed to fetch card info for ${id}`);
                }
                return result;
            })
        );
        
        // Build description
        for (let i = 0; i < cardInfoResults.length; i++) {
            const cardInfo = cardInfoResults[i];
            if (cardInfo && cardInfo.cardLink!="undefined") {
                // Card data is available
                const tierList = ['SR', 'SSR'];
                if (tierList.includes(cardInfo.tier) && !hasPinged && guildId === GATE_GUILD && allowRolePing) {
                    // Instantly send role ping for the first high tier card
                    const highTierRole = await getOrCreateHighTierRole(message.guild);
                    if (highTierRole) {
                        await message.reply({
                            content: `<@&${highTierRole.id}>`,
                            allowedMentions: { roles: [highTierRole.id] }
                        });
                        hasPinged = true;
                    }
                }
                lastTier = cardInfo.tier;
                const tierEmoji = getTierEmoji(cardInfo.tier + 'T');
                
                const versionsText = cardInfo.versions.availableVersions.length > 0 
                    ? `\`V:\` ${cardInfo.versions.availableVersions.map(version => `*__${version}__*`).join(', ')}` 
                    : "**No versions available**";
                
                const remainingText = cardInfo.versions.remainingVersions > 0 
                    ? ` \`+${cardInfo.versions.remainingVersions}v left\`` 
                    : '';

                const batchInfo = cardInfo.batchID ? `\`B-${cardInfo.batchID}\`` : '';

                const newEMOTE = cardInfo.batchID==4 ? '🆕' : '';

                const wishlistCount = cardInfo.wishlistCount;
                const seriesName = cardInfo.series.length > 25 ? cardInfo.series.substring(0, 25)+"..." : cardInfo.series;
                
                description += `${letters[i]} \`❤️ ${wishlistCount}\` ${tierEmoji} [${cardInfo.name}](${cardInfo.cardLink}) *${seriesName}*\n${batchInfo} ${versionsText}${remainingText}${newEMOTE} \n`;
            } else {
                // Card data is not available
                description += `${letters[i]} No Data Found\n`;
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

async function handleSummonInfo(client, newMessage, newEmbed, messageId) {
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
    
    if (!processedEdits.has(messageId) && newEmbed.image && (newEmbed.image.url.includes('cdn.mazoku.cc/packs') || newEmbed.image.url.includes('cdn.testzoku.org/')) ) {
        // Mark this message as processed
        processedEdits.set(messageId, Date.now());

        const allowRolePing = serverSettings?.settings?.allowRolePing ?? false;
        const allowShowStats = serverSettings?.settings?.allowShowStats ?? false;

        try {
            // Pass allowRolePing and allowShowStats to buildCardDescription
            if(allowShowStats){
                const urlParts = newEmbed.image.url.split('/');
                const cardIds = urlParts.slice(4, 7);
                
                // Determine elapsed time since message detection
                const elapsedTime = Math.floor(Date.now() / 1000) - startTime;

                // Calculate countdown time by subtracting the elapsed time from the desired countdown
                const countdownTime = (startTime + 18 - elapsedTime)>16?16:startTime + 18 - elapsedTime;
                const nextSummonTime = startTime + 120 - elapsedTime;

                // Create base embed with countdown
                const countdownEmbed = {
                    title: 'Summon Information',
                    fields: [
                        {
                            name: `Claim Time <t:${countdownTime}:R> 📵`,
                            value: `🌟 \`/help\` to see all commands`
                        }
                    ],
                    color: 0x0099ff
                };

                let description = null;

                const result = await buildCardDescription(cardIds, client, newMessage, guildId, allowRolePing);
                description = result.description;

                // Add description to embed if it exists
                if (description) {
                    countdownEmbed.description = description;
                }

                // Send countdown message
                const countdownMsg = await newMessage.reply({
                    embeds: [countdownEmbed]
                });

                // Update to next summon time
                setTimeout(async () => {
                    try {
                        countdownEmbed.fields[0] = {
                            name: `Next Summon <t:${nextSummonTime}:R> 📵`,
                            value: `🌟 \`/help\` to see all commands`
                        };
                        await countdownMsg.edit({
                            embeds: [countdownEmbed]
                        });
                    } catch (error) {
                        console.error('Error editing countdown message:', error);
                    }
                }, (16 - elapsedTime) * 1000);
            }
        } catch (error) {
            console.error('Error in handleSummonInfo:', error);
            const errorMessage = error.message === "The Mazoku Servers are currently unavailable. Please try again later."
                ? error.message
                : '*Data Unavailable*';
            
            const errorEmbed = {
                title: 'Summon Information',
                description: errorMessage,
                color: 0xff0000
            };

            await newMessage.reply({
                embeds: [errorEmbed]
            });
        }
    }
}

module.exports = {
    handleSummonInfo,
    processedEdits
};
