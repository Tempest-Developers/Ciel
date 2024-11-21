const findUserId = require('./findUserId');

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

async function handleClaim(client, newMessage, newEmbed, field, guildId) {
    try {
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

        const match = newEmbed.title.match(/<:(.+?):(\d+)> (.+?) \*#(\d+)\*/);
        if (!match) return;

        // Get the username of who claimed the card
        const claimer = field.name.split(" ")[2];
        const userId = await findUserId(client, claimer);
        
        // Validate tier is one of CT, RT, SRT, SSRT
        const tier = match[1];
        if (!['CT', 'RT', 'SRT', 'SSRT'].includes(tier)) {
            console.log(`Skipping claim for unsupported tier: ${tier}`);
            return;
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
            return;
        }

        // Mark this claim as processed with current timestamp
        processedClaims.set(claimKey, Date.now());
        console.warn(`GUILD: ${newMessage.guild.name} | ${newMessage.guild.id}`);
        // console.log('Card Claimed:', cardClaimed);

        // Create server and player data if they don't exist
        let serverPlayerData = await client.database.getPlayerData(userId, guildId);
        if (!serverPlayerData) {
            await client.database.createPlayer(userId, guildId);
            serverPlayerData = await client.database.getPlayerData(userId, guildId);
        }

        // Add claim to database if card tracking is enabled
        // For Gate guild, check gateServerData settings, for other guilds always track
        const GATE_GUILD = '1240866080985976844';
        const shouldTrackCards = guildId === GATE_GUILD 
            ? (await client.database.mGateServerDB.findOne({ serverID: GATE_GUILD }))?.cardTrackingEnabled !== false
            : true;

        if (shouldTrackCards) {
            // Update both player and server databases
            await Promise.all([
                client.database.addClaim(guildId, userId, cardClaimed),
                client.database.addServerClaim(guildId, cardClaimed)
            ]);
            console.log(`Updated ${userId} - ${cardClaimed.owner} player and server | Server ${guildId} - ${newMessage.guild.name} Database`);
        }
    } catch (error) {
        console.error('Error processing claim:', error);
    }
}

module.exports = handleClaim;
