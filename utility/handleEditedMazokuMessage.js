require('dotenv').config();
const findUserId = require('../utility/findUserId');

const GATE_GUILD = '1240866080985976844';

// Use a Map to track processed claims with a TTL
const processedClaims = new Map();

// Clean up old entries every hour
setInterval(() => {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    for (const [key, timestamp] of processedClaims.entries()) {
        if (timestamp < oneHourAgo) {
            processedClaims.delete(key);
        }
    }
}, 60 * 60 * 1000);

module.exports = async (client, oldMessage, newMessage, exemptBotId) => {
    try {
        // Check if edit is from exempt bot
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

        // Get server data for settings check
        let serverData = await client.database.getServerData(guildId);
        if (!serverData) {
            await client.database.createServer(guildId);
            serverData = await client.database.getServerData(guildId);
        }

        // Get Gate server data only if in Gate guild (for economy features)
        let gateServerData;
        if (guildId === GATE_GUILD) {
            gateServerData = await client.database.mGateServerDB.findOne({ serverID: GATE_GUILD });
            if (!gateServerData) {
                await client.database.createGateServer(GATE_GUILD);
                gateServerData = await client.database.mGateServerDB.findOne({ serverID: GATE_GUILD });
            }
        }

        // Process embed fields for claims
        for (const field of newEmbed.fields) {
            if (field.value.includes('made by') && newMessage.content === "Claimed and added to inventory!") {
                const match = newEmbed.title.match(/<:(.+?):(\d+)> (.+?) \*#(\d+)\*/);
                if (match) {
                    const userId = await findUserId(client, field.name.split(" ")[2]);

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
                        owner: field.name.split(" ")[2],
                        artist: field.value.split(" ")[3],
                        print: match[4],
                        tier: tier,
                        timestamp: newEmbed.timestamp
                    };

                    // Create unique key for this claim
                    const claimKey = `${cardClaimed.claimedID}-${cardClaimed.cardID}-${cardClaimed.timestamp}-${cardClaimed.userID}-${cardClaimed.serverID}`;

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
                            ? gateServerData.cardTrackingEnabled !== false
                            : true;

                        if (shouldTrackCards) {
                            await client.database.addClaim(guildId, userId, cardClaimed);
                            console.log(`Updated ${userId} - ${cardClaimed.owner} player | Server ${guildId} - ${newMessage.guild.name} Database`);
                        }

                        // Handle economy rewards only for Gate guild
                        if (guildId === GATE_GUILD && gateServerData.economyEnabled) {
                            // Add token reward
                            let userData = await client.database.mGateDB.findOne({ userID: userId });
                            if (!userData) {
                                await client.database.createGateUser(userId);
                                userData = await client.database.mGateDB.findOne({ userID: userId });
                            }

                            // Generate random token reward (0-10)
                            const currentTokens = userData.currency[0];
                            let tokenReward;
                            const rand = Math.random() * 100;

                            if (rand < 20) { // 20% chance of 0 tokens
                                tokenReward = 0;
                            } else if (rand < 50) { // 30% chance of 1-3 tokens
                                tokenReward = Math.floor(Math.random() * 3) + 1;
                            } else if (rand < 75) { // 25% chance of 4-6 tokens
                                tokenReward = Math.floor(Math.random() * 3) + 4;
                            } else if (rand < 95) { // 20% chance of 7-9 tokens
                                tokenReward = Math.floor(Math.random() * 3) + 7;
                            } else { // 5% chance of 10 tokens
                                tokenReward = 10;
                            }

                            // Check max token limit
                            if (currentTokens + tokenReward > 25000) {
                                tokenReward = Math.max(0, 25000 - currentTokens);
                            }

                            if (tokenReward > 0) {
                                await client.database.mGateDB.updateOne(
                                    { userID: userId },
                                    { $inc: { 'currency.0': tokenReward } }
                                );

                                // Send reward message
                                const rewardMessage = await newMessage.channel.send({
                                    content: `🪙 ${field.name.split(" ")[2]} earned ${tokenReward} Slime Tokens!`,
                                    components: [{
                                        type: 1,
                                        components: [{
                                            type: 2,
                                            style: 1,
                                            label: 'Earn Tokens',
                                            custom_id: 'earn_tokens',
                                        }]
                                    }]
                                });

                                // Delete reward message after 10 seconds
                                setTimeout(() => {
                                    rewardMessage.delete().catch(console.error);
                                }, 10000);
                            }
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
