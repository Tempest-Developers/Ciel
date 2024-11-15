require('dotenv').config();
const handleClaim = require('./claimHandler');
const handleManualClaim = require('./manualClaimHandler');
const { handleSummonInfo } = require('./summonHandler');
const { handleManualSummonInfo } = require('./manualSummonHandler');
const GATE_GUILD = '1240866080985976844';

ManualSummonGuild = [process.env.GATE_GUILD, process.env.ORCA_GUILD, process.env.HTTAG_GUILD ]

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

        if (!oldEmbed.title) {
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

        // Handle based on summon type
        if (oldEmbed.title.includes("Automatic Summon!")) {
            // Handle automatic summon information if it's a pack image
            await handleSummonInfo(client, newMessage, newEmbed, messageId);

            // Process embed fields for automatic claims
            for (const field of newEmbed.fields) {
                if (field.value.includes('made by') && newMessage.content === "Claimed and added to inventory!") {
                    await handleClaim(client, newMessage, newEmbed, field, guildId);
                }
            }
        } else if (oldEmbed.title.includes("Manual Summon") && ManualSummonGuild.includes(guildId)) {
            // Handle manual summon information if it's a pack image
            await handleManualSummonInfo(client, newMessage, newEmbed, messageId);

            // // Process embed fields for manual claims
            // for (const field of newEmbed.fields) {
            //     if (field.value.includes('made by') && newMessage.content === "Claimed and added to inventory!") {
            //         await handleManualClaim(client, newMessage, newEmbed, field, guildId);
            //     }
            // }
        }
    } catch (error) {
        console.error('Error handling summon embed edit:', error);
    }
};
