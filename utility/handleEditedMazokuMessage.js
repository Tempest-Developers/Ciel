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
                    const claimKey = `${cardClaimed.cardID}-${cardClaimed.timestamp}-${cardClaimed.userID}-${cardClaimed.serverID}`;

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
