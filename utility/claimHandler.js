const findUserId = require('./findUserId');

// Use a Map to track processed claims with a TTL
const processedClaims = new Map();

// Use a Map to track recent claim attempts
const recentClaimAttempts = new Map();

// Clean up old entries every hour
setInterval(() => {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    for (const [key, timestamp] of processedClaims.entries()) {
        if (timestamp < oneHourAgo) {
            processedClaims.delete(key);
        }
    }
    // Also clean up recent claim attempts
    for (const [key, timestamp] of recentClaimAttempts.entries()) {
        if (timestamp < oneHourAgo) {
            recentClaimAttempts.delete(key);
        }
    }
}, 60 * 60 * 1000);

async function handleClaim(client, newMessage, newEmbed, field, guildId) {
    try {
        // Generate claim data
        const claimData = generateClaimData(newMessage, newEmbed, field, guildId);
        if (!claimData) return;

        // Create unique key for this claim (without timestamp)
        const claimKey = `${claimData.cardID}-${claimData.userID}-${claimData.serverID}`;
        
        // Check for recent claim attempts (5 second cooldown)
        const recentAttempt = recentClaimAttempts.get(claimKey);
        if (recentAttempt && Date.now() - recentAttempt < 5000) {
            console.log(`Skipping claim attempt due to cooldown: ${claimKey}`);
            return;
        }
        recentClaimAttempts.set(claimKey, Date.now());

        // Check if we've already processed this claim recently
        if (processedClaims.has(claimKey)) {
            console.log(`Skipping duplicate claim: ${claimKey}`);
            return;
        }

        // Mark this claim as processed with current timestamp
        processedClaims.set(claimKey, Date.now());

        console.warn(`Processing claim at ${newMessage.guild.name} | ${guildId}, ClaimKey: ${claimKey}`);

        // Get server data and settings
        let [serverData, serverSettings] = await Promise.all([
            getOrCreateServerData(client, guildId),
            getOrCreateServerSettings(client, guildId)
        ]);

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
            console.log(`Updated ${userId} - ${claimData.owner} | ${newMessage.guild.name} ${guildId} Database`, 'background: #222; color: #bada55' );
        }
    } catch (error) {
        console.error('Error processing claim:', error);
    }
}

function generateClaimData(newMessage, newEmbed, field, guildId) {
    const match = newEmbed.title.match(/<:(.+?):(\d+)> (.+?) \*#(\d+)\*/);
    if (!match) return null;

    const claimer = field.name.split(" ")[2];
    
    return {
        claimedID: match[2],
        userID: claimer,
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

async function getOrCreateServerData(client, guildId) {
    let serverData = await client.database.getServerData(guildId);
    if (!serverData) {
        await client.database.createServer(guildId);
        serverData = await client.database.getServerData(guildId);
    }
    return serverData;
}

async function getOrCreateServerSettings(client, guildId) {
    let serverSettings = await client.database.getServerSettings(guildId);
    if (!serverSettings) {
        await client.database.createServerSettings(guildId);
        serverSettings = await client.database.getServerSettings(guildId);
    }
    return serverSettings;
}

module.exports = handleClaim;
