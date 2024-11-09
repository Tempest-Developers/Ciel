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
        const { getServerData, getPlayerData, createServer, createPlayer, addClaim } = await client.database;
        const { mGateDB, mGateServerDB } = client.database;

        // Check if edit is from exempt bot and in Gate Guild
        if (oldMessage.author.id !== exemptBotId || newMessage.guild.id !== GATE_GUILD) {
            return;
        }

        // Check if economy is enabled
        let serverData = await mGateServerDB.findOne({ serverID: GATE_GUILD });
        if (!serverData) {
            await mGateServerDB.insertOne({
                serverID: GATE_GUILD,
                economyEnabled: true,
                totalTokens: 0,
                mods: [],
                giveaway: []
            });
            serverData = await mGateServerDB.findOne({ serverID: GATE_GUILD });
        }

        if (!serverData.economyEnabled) {
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

        // Process embed fields for claims
        for (const field of newEmbed.fields) {
            if (field.value.includes('made by') && newMessage.content === "Claimed and added to inventory!") {
                const match = newEmbed.title.match(/<:(.+?):(\d+)> (.+?) \*#(\d+)\*/);
                if (match) {
                    const userId = await findUserId(client, field.name.split(" ")[2]);
                    const guildId = newMessage.guild.id;

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
                        let serverData = await getServerData(guildId);
                        let serverPlayerData = await getPlayerData(userId, guildId);

                        if (!serverData) {
                            await createServer(guildId);
                        }
                        if (!serverPlayerData) {
                            await createPlayer(userId, guildId);
                        }

                        // Add claim to database
                        await addClaim(guildId, userId, cardClaimed);
                        console.log(`Updated ${userId} - ${cardClaimed.owner} player | Server ${guildId} - ${newMessage.guild.name} Database`);

                        // Add token reward
                        let userData = await mGateDB.findOne({ userID: userId });
                        if (!userData) {
                            await mGateDB.insertOne({
                                userID: userId,
                                currency: [0, 0, 0, 0, 0],
                                tickets: [],
                                mission: [],
                                achievements: []
                            });
                            userData = await mGateDB.findOne({ userID: userId });
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
                            await mGateDB.updateOne(
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
