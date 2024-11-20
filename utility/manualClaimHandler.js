const findUserId = require('./findUserId');

// Use a Map to track processed manual claims with a TTL
const processedManualClaims = new Map();

// Use a Map to track manual summon cooldowns
const manualClaimCooldowns = new Map();

// Clean up old entries every hour
setInterval(() => {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    for (const [key, timestamp] of processedManualClaims.entries()) {
        if (timestamp < oneHourAgo) {
            processedManualClaims.delete(key);
        }
    }
}, 60 * 60 * 1000);

async function startManualClaimCooldown(userId, channelId, guildId, client) {
    const cooldownKey = `${userId}-${channelId}`;
    manualClaimCooldowns.set(cooldownKey, Date.now());

    // Set 30-minute cooldown
    setTimeout(async () => {
        try {
            // Check if cooldown pings are enabled for this server
            const serverSettings = await client.database.getServerSettings(guildId);
            if (!serverSettings?.settings?.allowCooldownPing) {
                manualClaimCooldowns.delete(cooldownKey);
                return;
            }

            const channel = await client.channels.fetch(channelId);
            if (channel) {
                const user = await client.users.fetch(userId);
                await channel.send(`${user}, your Manual Summon is ready! 🎉`);
            }
            manualClaimCooldowns.delete(cooldownKey);
        } catch (error) {
            console.error('Error sending manual summon ready notification:', error);
            manualClaimCooldowns.delete(cooldownKey);
        }
    }, 30 * 60 * 1000); // 30 minutes
}

async function handleManualClaim(client, newMessage, newEmbed, field, guildId) {
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
            console.log(`Skipping manual claim for unsupported tier: ${tier}`);
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
        await startManualClaimCooldown(userId, newMessage.channel.id, guildId, client);

        // // Create unique key for this manual claim
        // const claimKey = `manual-${cardClaimed.cardID}-${cardClaimed.userID}-${cardClaimed.serverID}-${cardClaimed.timestamp}`;
        
        // // Check if we've already processed this manual claim recently
        // if (processedManualClaims.has(claimKey)) {
        //     console.log(`Skipping duplicate manual claim: ${claimKey}`);
        //     return;
        // }

        // // Mark this manual claim as processed with current timestamp
        // processedManualClaims.set(claimKey, Date.now());
        // console.warn(`GUILD: ${newMessage.guild.name} | ${newMessage.guild.id}`);
        // console.log('Card Manually Claimed:', cardClaimed);

        // // Create server and player data if they don't exist
        // let serverPlayerData = await client.database.getPlayerData(userId, guildId);
        // if (!serverPlayerData) {
        //     await client.database.createPlayer(userId, guildId);
        //     serverPlayerData = await client.database.getPlayerData(userId, guildId);
        // }

        // // Add manual claim to database if card tracking is enabled
        // // For Gate guild, check gateServerData settings, for other guilds always track
        // const GATE_GUILD = '1240866080985976844';
        // const shouldTrackCards = guildId === GATE_GUILD 
        //     ? (await client.database.mGateServerDB.findOne({ serverID: GATE_GUILD }))?.cardTrackingEnabled !== false
        //     : true;

        // if (shouldTrackCards) {
        //     // Update both player manual claims and server claims
        //     await Promise.all([
        //         client.database.addManualClaim(guildId, userId, cardClaimed),
        //     ]);
        //     console.log(`Updated ${userId} - ${cardClaimed.owner} player manual claims and server | Server ${guildId} - ${newMessage.guild.name} Database`);
            
        //     // Start cooldown for the claimer
        //     await startManualClaimCooldown(userId, newMessage.channel.id, guildId, client);
        // }
    } catch (error) {
        console.error('Error processing manual claim:', error);
    }
}

module.exports = {
    handleManualClaim,
    manualClaimCooldowns
};
