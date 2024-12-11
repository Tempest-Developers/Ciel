require('dotenv').config();
const handleClaim = require('./claimHandler');
const handleManualClaim = require('./manualClaimHandler');
const { handleSummonInfo } = require('./summonHandler');
const { handleManualSummonInfo } = require('./manualSummonHandler');
const { createServer, createServerSettings } = require('../database/modules/server');

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
        try {
            let serverData = await client.database.getServerData(guildId);
            if (!serverData) {
                await createServer(guildId);
                serverData = await client.database.getServerData(guildId);
                if (!serverData) {
                    console.error(`Failed to create server data for guild ${guildId}`);
                    return;
                }
            }

            // Get server settings
            let serverSettings = await client.database.getServerSettings(guildId);
            if (!serverSettings) {
                await createServerSettings(guildId);
                serverSettings = await client.database.getServerSettings(guildId);
                if (!serverSettings) {
                    console.error(`Failed to create server settings for guild ${guildId}`);
                    return;
                }
            }

            // Verify settings structure
            if (!serverSettings.settings?.handlers) {
                console.error(`Corrupted server settings for guild ${guildId}`);
                return;
            }

            // Handle based on summon type
            if (oldEmbed.title.includes("Automatic Summon!")) {
                // Check if summon handler is enabled
                if (serverSettings.settings.handlers.summon) {
                    // Handle automatic summon information if it's a pack image
                    await handleSummonInfo(client, newMessage, newEmbed, messageId);
                }

                // Check if claim handler is enabled
                if (serverSettings.settings.handlers.claim) {
                    // Process embed fields for automatic claims
                    for (const field of newEmbed.fields) {
                        if (field.value.includes('made by') && newMessage.content === "Claimed and added to inventory!") {
                            await handleClaim(client, newMessage, newEmbed, field, guildId);
                        }
                    }
                }
            } else if (oldEmbed.title.includes("Manual Summon")) {
                // Check if manual summon handler is enabled
                if (serverSettings.settings.handlers.manualSummon) {
                    // Handle manual summon information if it's a pack image
                    await handleManualSummonInfo(client, newMessage, newEmbed, messageId);
                }

                // Check if manual claim handler is enabled
                if (serverSettings.settings.handlers.manualClaim) {
                    // Process embed fields for manual claims
                    for (const field of newEmbed.fields) {
                        if (field.value.includes('made by') && newMessage.content === "Claimed and added to inventory!") {
                            // await handleManualClaim(client, newMessage, newEmbed, field, guildId);
                        }
                    }
                }
            }
        } catch (error) {
            console.error(`Error handling server data/settings for guild ${guildId}:`, error);
        }
    } catch (error) {
        console.error('Error handling summon embed edit:', error);
    }
};
