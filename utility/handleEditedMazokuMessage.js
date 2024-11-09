require('dotenv').config();
const findUserId = require('../utility/findUserId');

let lastRemberedEmbed = "";

module.exports = async (client, oldMessage, newMessage, exemptBotId) => {
    try {
        const { getServerData, getPlayerData, createServer, createPlayer, addClaim } = await client.database;

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

        // Prevent duplicate processing
        if (lastRemberedEmbed == oldEmbed) {
            return;
        } else {
            lastRemberedEmbed = oldMessage.embeds[0];
        }

        // Process embed fields for claims
        newEmbed.fields.forEach(async (field) => {
            if (field.value.includes('made by') && newMessage.content === "Claimed and added to inventory!") {
                const match = newEmbed.title.match(/<:(.+?):(\d+)> (.+?) \*#(\d+)\*/);
                if (match) {
                    const userId = await findUserId(client, field.name.split(" ")[2]);
                    const guildId = newMessage.guild.id;

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
                        owner: field.name.split(" ")[2],
                        artist: field.value.split(" ")[3],
                        print: match[4],
                        tier: tier,
                        timestamp: newEmbed.timestamp
                    };

                    console.warn(`GUILD: ${newMessage.guild.name} | ${newMessage.guild.id}`);
                    console.log('Card Claimed:', cardClaimed);

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
                }
            }
        });
    } catch (error) {
        console.error('Error handling summon embed edit:', error);
    }
}
