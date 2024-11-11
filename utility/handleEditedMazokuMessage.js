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
    if (!cardData || !cardData.length) return [];
    const existingVersions = cardData.map(item => item.version);
    const missingVersions = [];
    for (let i = 1; i <= 10; i++) {
        if (!existingVersions.includes(i)) {
            missingVersions.push(i);
        }
    }
    return missingVersions;
}

async function getOrCreateHighTierRole(guild) {
    try {
        let role = guild.roles.cache.find(r => r.name === 'HighTier');
        if (!role) {
            role = await guild.roles.create({
                name: 'HighTier',
                reason: 'Created for High Tier card notifications'
            });
        }
        return role;
    } catch (error) {
        console.error('Error managing HighTier role:', error);
        return null;
    }
}

async function buildCardDescription(cardIds) {
    let hasHighTierCard = false;
    let description = '';
    const letters = [':regional_indicator_a:', ':regional_indicator_b:', ':regional_indicator_c:'];
    
    // Get card info for all cards at once
    const cardInfoResults = await Promise.all(cardIds.map(id => getCardInfo(id)));
    
    // Build description
    for (let i = 0; i < cardInfoResults.length; i++) {
        const cardInfo = cardInfoResults[i];
        if (cardInfo) {
            if (cardInfo.tier === 'R' || cardInfo.tier === 'SR' || cardInfo.tier === 'SSR') {
                hasHighTierCard = true;
            }
            const tierEmoji = getTierEmoji(cardInfo.tier + 'T');
            description += `${letters[i]} ${tierEmoji} **${cardInfo.name}** *${cardInfo.series}* \n Lower Versions Available**${cardInfo.versions.map(version => `*__${version}__*`).join(', ') || ""}**\n`;
        }
    }
    
    return { description, hasHighTierCard };
}

module.exports = async (client, oldMessage, newMessage, exemptBotId) => {
    try {
        // Check if message is from exempt bot
        if (oldMessage.author.id !== exemptBotId) {
            return;
        }

        // Check if message has embeds
        if (!oldMessage.embeds.length || !newMessage.embeds.length) {
            return;
        }

        // Get the embeds
        const oldEmbed = oldMessage.embeds[0];
        const newEmbed = newMessage.embeds[0];

        if (!oldEmbed.title || !oldEmbed.title.includes("Automatic Summon!")) {
            return;
        }

        const guildId = newMessage.guild.id;
        const messageId = newMessage.id;

        // Get server data for settings check
        let serverData = await client.database.getServerData(guildId);
        if (!serverData) {
            await client.database.createServer(guildId);
            serverData = await client.database.getServerData(guildId);
        }

        // Get server settings - Updated to use correct path
        const serverSettings = await client.database.serverSettings.findOne({ serverID: guildId });
        const allowRolePing = serverSettings?.settings?.allowRolePing ?? false;

        // Calculate timestamps for all guilds
        const countdownTime = Math.floor(Date.now() / 1000) + 19;
        const nextSummonTime = Math.floor(Date.now() / 1000) + 120;

        // Send initial countdown message if this is the first time seeing this message
        if (!processedEdits.has(messageId)) {
            processedEdits.set(messageId, Date.now());
            console.log("Claim Time Detected")

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

            if(newEmbed.image) console.log("Image Exist in embed")

            if (newEmbed.image && newEmbed.image.url.includes('cdn.mazoku.cc/packs')) {
                const urlParts = newEmbed.image.url.split('/');
                const cardIds = urlParts.slice(4, 7);
                console.log(urlParts)

                // Wait for all card info and build description
                const { description, hasHighTierCard } = await buildCardDescription(cardIds);

                // Add description to embed
                if (description && allowRolePing) {
                    countdownEmbed.description = description;
                }

                // Only add role ping if allowRolePing is true AND there's a high tier card
                if (allowRolePing && hasHighTierCard) {
                    const highTierRole = await getOrCreateHighTierRole(newMessage.guild);
                    if (highTierRole) {
                        roleContent = `<@&${highTierRole.id}>`;
                        roleId = highTierRole.id;
                    }
                }
                console.log(`${newMessage.guild.name} allowed ${allowRolePing} and has ${hasHighTierCard}`)
                console.log(description)
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
            }, 19000);
        }

        // Process embed fields for claims
        for (const field of newEmbed.fields) {
            if (field.value.includes('made by') && newMessage.content === "Claimed and added to inventory!") {
                const match = newEmbed.title.match(/<:(.+?):(\d+)> (.+?) \*#(\d+)\*/);
                if (match) {
                    // Get the username of who claimed the card
                    const claimer = field.name.split(" ")[2];
                    const userId = await findUserId(client, claimer);

                    // Validate tier is one of CT, RT, SRT, SSRT
                    const tier = match[1];
                    if (!['CT', 'RT', 'SRT', 'SSRT'].includes(tier)) {
                        console.log(`Skipping claim for unsupported tier: ${tier}`);
                        continue;
                    }

                    const cardClaimed = {
                        claimedID: match[2],
                        userID: userId,
                        serverID: guildId,
                        cardName: match[3],
                        cardID: newEmbed.image.url.split("/")[4],
                        owner: claimer,
                        artist: field.value.split(" ")[3],
                        print: match[4],
                        tier: tier,
                        timestamp: newEmbed.timestamp
                    };

                    // Create unique key for this claim
                    const claimKey = `${cardClaimed.cardID}-${cardClaimed.userID}-${cardClaimed.serverID}-${cardClaimed.timestamp}`;

                    // Check if we've already processed this claim recently
                    if (processedClaims.has(claimKey)) {
                        console.log(`Skipping duplicate claim: ${claimKey}`);
                        continue;
                    }

                    // Mark this claim as processed with current timestamp
                    processedClaims.set(claimKey, Date.now());

                    console.warn(`GUILD: ${newMessage.guild.name} | ${newMessage.guild.id}`);
                    console.log('Card Claimed:', cardClaimed);

                    try {
                        // Create server and player data if they don't exist
                        let serverPlayerData = await client.database.getPlayerData(userId, guildId);
                        if (!serverPlayerData) {
                            await client.database.createPlayer(userId, guildId);
                        }

                        // Add claim to database if card tracking is enabled
                        // For Gate guild, check gateServerData settings, for other guilds always track
                        const shouldTrackCards = guildId === GATE_GUILD 
                            ? (await client.database.mGateServerDB.findOne({ serverID: GATE_GUILD }))?.cardTrackingEnabled !== false
                            : true;

                        if (shouldTrackCards) {
                            await client.database.addClaim(guildId, userId, cardClaimed);
                            console.log(`Updated ${userId} - ${cardClaimed.owner} player | Server ${guildId} - ${newMessage.guild.name} Database`);
                        }
                    } catch (error) {
                        console.error('Error processing claim:', error);
                        // Remove from processed claims if there was an error
                        processedClaims.delete(claimKey);
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error handling summon embed edit:', error);
    }
};
