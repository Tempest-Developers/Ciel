const { SlashCommandBuilder } = require('discord.js');
const { getServerSettings, createServerSettings } = require('../database/modules/server');
const { handleInteraction, handleCommandError, safeDefer } = require('../utility/interactionHandler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('hstat')
        .setDescription('View server handler settings (Developer only)')
        .addSubcommand(subcommand =>
            subcommand
                .setName('server')
                .setDescription('View detailed settings for a specific server')
                .addStringOption(option =>
                    option.setName('id')
                        .setDescription('Server ID to check')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('default')
                .setDescription('View overview of all server settings')),

    async execute(interaction) {
        try {
            // Only allow specific user to use this command
            if (interaction.user.id !== '292675388180791297') {
                return await handleInteraction(interaction, {
                    content: 'You are not authorized to use this command.',
                    ephemeral: true
                });
            }

            // Defer the reply immediately to prevent timeout
            await safeDefer(interaction, { ephemeral: true });

            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'server') {
                const serverId = interaction.options.getString('id');

                // Verify the server exists and bot has access to it
                try {
                    const guild = await interaction.client.guilds.fetch(serverId);
                    if (!guild) {
                        return await handleInteraction(interaction, {
                            content: 'Unable to find the specified server. Please check the server ID.',
                        }, 'editReply');
                    }

                    let serverSettings = await getServerSettings(serverId);
                    
                    // If settings don't exist, create them
                    if (!serverSettings) {
                        await createServerSettings(serverId);
                        serverSettings = await getServerSettings(serverId);
                        if (!serverSettings) {
                            return await handleInteraction(interaction, {
                                content: 'Failed to create server settings.',
                            }, 'editReply');
                        }
                    }

                    // Ensure settings structure exists
                    if (!serverSettings.settings?.handlers) {
                        return await handleInteraction(interaction, {
                            content: 'Server settings are corrupted. Please contact the developer.',
                        }, 'editReply');
                    }

                    const message = [
                        `🔧 Server Settings: ${guild.name}`,
                        `Server ID: ${serverId}`,
                        '',
                        '👑 Developer Controls',
                        `claim: ${serverSettings.settings.handlers.claim ? '🟢' : '🔴'}`,
                        `summ: ${serverSettings.settings.handlers.summon ? '🟢' : '🔴'}`,
                        `mclaim: ${serverSettings.settings.handlers.manualClaim ? '🟢' : '🔴'}`,
                        `msumm: ${serverSettings.settings.handlers.manualSummon ? '🟢' : '🔴'}`,
                        '',
                        '⚙️ Admin Settings',
                        `Tier Display: ${serverSettings.settings.allowRolePing ? '🟢' : '🔴'}`,
                        `Cooldown Pings: ${serverSettings.settings.allowCooldownPing ? '🟢' : '🔴'}`
                    ].join('\n');

                    await handleInteraction(interaction, { content: message }, 'editReply');
                } catch (error) {
                    if (error.code === 10004) { // Discord API error for unknown guild
                        return await handleInteraction(interaction, {
                            content: 'Unable to access the specified server. Please verify the server ID and ensure the bot has access to it.',
                        }, 'editReply');
                    }
                    throw error;
                }
            } else if (subcommand === 'default') {
                // Get all server settings
                const guilds = await interaction.client.guilds.fetch();
                const allSettings = [];

                // Fetch settings for each guild the bot is in
                for (const [id, guild] of guilds) {
                    let settings = await getServerSettings(id);
                    
                    // If settings don't exist, create them
                    if (!settings) {
                        await createServerSettings(id);
                        settings = await getServerSettings(id);
                    }

                    // Only add if settings exist and have proper structure
                    if (settings?.settings?.handlers) {
                        allSettings.push({ guild, settings });
                    }
                }

                // Create messages array to handle Discord's character limit
                const messages = ['🌐 Server Settings Overview\n'];
                let currentMessage = messages[0];

                for (const { guild, settings } of allSettings) {
                    const handlers = [
                        settings.settings.handlers.claim ? '🟢' : '🔴',
                        settings.settings.handlers.summon ? '🟢' : '🔴',
                        settings.settings.handlers.manualClaim ? '🟢' : '🔴',
                        settings.settings.handlers.manualSummon ? '🟢' : '🔴'
                    ].join('');
                    
                    const adminSettings = [
                        settings.settings.allowRolePing ? '🟢' : '🔴',
                        settings.settings.allowCooldownPing ? '🟢' : '🔴'
                    ].join('');

                    const serverInfo = `\n${guild.name} (${guild.id})\n${handlers} | ${adminSettings}\n`;

                    // Check if adding this server would exceed Discord's limit
                    if (currentMessage.length + serverInfo.length > 1900) { // Using 1900 to be safe
                        messages.push(serverInfo);
                        currentMessage = serverInfo;
                    } else {
                        currentMessage += serverInfo;
                        messages[messages.length - 1] = currentMessage;
                    }
                }

                // Add legend to the last message
                messages[messages.length - 1] += '\n🟢 Enabled | 🔴 Disabled\nOrder: claim,summ,mclaim,msumm | tier,ping';

                // Send all messages
                await handleInteraction(interaction, { content: messages[0] }, 'editReply');
                for (let i = 1; i < messages.length; i++) {
                    await handleInteraction(interaction, { content: messages[i], ephemeral: true }, 'followUp');
                }
            }
        } catch (error) {
            await handleCommandError(interaction, error, 'An error occurred while executing this command.');
        }
    },
};
