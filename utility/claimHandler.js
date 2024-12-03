const findUserId = require('./findUserId');

// Use a Map to track processed claims with a TTL
const processedClaims = new Map();

// Use a Map to track server-specific processing status
const serverProcessing = new Map();

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
    // Generate claim data
    const claimData = generateClaimData(newMessage, newEmbed, field, guildId);
    
    // Create unique key for this claim
    const claimKey = `${claimData.cardID}-${claimData.userID}-${claimData.serverID}-${claimData.timestamp}`;
    
    // Check if we've already processed this claim recently
    if (processedClaims.has(claimKey)) {
        console.log(`Skipping duplicate claim: ${claimKey}`);
        return;
    }

    // Mark this claim as processed with current timestamp
    processedClaims.set(claimKey, Date.now());

    // Process the claim asynchronously
    processClaimAsync(client, claimData, claimKey, guildId);
}

function generateClaimData(newMessage, newEmbed, field, guildId) {
    const match = newEmbed.title.match(/<:(.+?):(\d+)> (.+?) \*#(\d+)\*/);
    if (!match) return null;

    const claimer = field.name.split(" ")[2];
    
    return {
        claimedID: match[2],
        userID: claimer, // We'll resolve this to the actual user ID later
        serverID: guildId,
        cardName: match[3],
        cardID: newEmbed.image.url.split("/")[4],
        owner: claimer,
        artist: field.value.split(" ")[3],
        print: match[4],
        tier: match[1],
        timestamp: newEmbed.timestamp
    };
}

async function processClaimAsync(client, claimData, claimKey, guildId) {
    try {
        console.log(`Processing claim for server: ${guildId}, ClaimKey: ${claimKey}`);

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

        // Validate tier
        if (!['CT', 'RT', 'SRT', 'SSRT'].includes(claimData.tier)) {
            console.log(`Skipping claim for unsupported tier: ${claimData.tier}`);
            return;
        }

        // Resolve user ID
        const userId = await findUserId(client, claimData.userID);
        claimData.userID = userId;

        // Create server and player data if they don't exist
        let serverPlayerData = await client.database.getPlayerData(userId, guildId);
        if (!serverPlayerData) {
            await client.database.createPlayer(userId, guildId);
            serverPlayerData = await client.database.getPlayerData(userId, guildId);
        }

        // Add claim to database if card tracking is enabled
        const GATE_GUILD = '1240866080985976844';
        const shouldTrackCards = guildId === GATE_GUILD 
            ? (await client.database.mGateServerDB.findOne({ serverID: GATE_GUILD }))?.cardTrackingEnabled !== false
            : true;

        if (shouldTrackCards) {
            // Update both player and server databases
            await Promise.all([
                client.database.addClaim(guildId, userId, claimData),
                client.database.addServerClaim(guildId, claimData)
            ]);
            console.log(`Updated ${userId} - ${claimData.owner} player and server | Server ${guildId} Database`);
        }
    } catch (error) {
        console.error('Error processing claim:', error);
    } finally {
        // Remove the processing flag for this server
        serverProcessing.delete(guildId);
    }
}

module.exports = handleClaim;
