const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getServerSettings, createServerSettings } = require('../database/modules/server');

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
                return await interaction.reply({
                    content: 'You are not authorized to use this command.',
                    ephemeral: true
                });
            }

            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'server') {
                const serverId = interaction.options.getString('id');

                // Verify the server exists and bot has access to it
                try {
                    const guild = await interaction.client.guilds.fetch(serverId);
                    if (!guild) {
                        return await interaction.reply({
                            content: 'Unable to find the specified server. Please check the server ID.',
                            ephemeral: true
                        });
                    }

                    let serverSettings = await getServerSettings(serverId);
                    
                    // If settings don't exist, create them
                    if (!serverSettings) {
                        await createServerSettings(serverId);
                        serverSettings = await getServerSettings(serverId);
                        if (!serverSettings) {
                            return await interaction.reply({
                                content: 'Failed to create server settings.',
                                ephemeral: true
                            });
                        }
                    }

                    // Ensure settings structure exists
                    if (!serverSettings.settings?.handlers) {
                        return await interaction.reply({
                            content: 'Server settings are corrupted. Please contact the developer.',
                            ephemeral: true
                        });
                    }

                    const embed = new EmbedBuilder()
                        .setTitle(`🔧 Server Settings: ${guild.name}`)
                        .setDescription(`Server ID: ${serverId}`)
                        .addFields(
                            {
                                name: '👑 Developer Controls',
                                value: `claim: ${serverSettings.settings.handlers.claim ? '🟢' : '🔴'}
summ: ${serverSettings.settings.handlers.summon ? '🟢' : '🔴'}
mclaim: ${serverSettings.settings.handlers.manualClaim ? '🟢' : '🔴'}
msumm: ${serverSettings.settings.handlers.manualSummon ? '🟢' : '🔴'}`
                            },
                            {
                                name: '⚙️ Admin Settings',
                                value: `Tier Display: ${serverSettings.settings.allowRolePing ? '🟢' : '🔴'}
Cooldown Pings: ${serverSettings.settings.allowCooldownPing ? '🟢' : '🔴'}`
                            }
                        )
                        .setColor(0x0099ff)
                        .setTimestamp();

                    await interaction.reply({ embeds: [embed], ephemeral: true });
                } catch (error) {
                    if (error.code === 10004) { // Discord API error for unknown guild
                        return await interaction.reply({
                            content: 'Unable to access the specified server. Please verify the server ID and ensure the bot has access to it.',
                            ephemeral: true
                        });
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
                
                const embed = new EmbedBuilder()
                    .setTitle('🌐 Server Settings Overview')
                    .setColor(0x0099ff)
                    .setTimestamp();

                let description = '';
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

                    description += `\n**${guild.name}** (${guild.id})\n`;
                    description += `${handlers} | ${adminSettings}\n`;
                }

                embed.setDescription(description || 'No server settings found')
                    .setFooter({ text: '🟢 Enabled | 🔴 Disabled\nOrder: claim,summ,mclaim,msumm | tier,ping' });

                await interaction.reply({ embeds: [embed], ephemeral: true });
            }
        } catch (error) {
            console.error('Error in hstat command:', error);
            await interaction.reply({
                content: 'There was an error while executing this command.',
                ephemeral: true
            });
        }
    },
};
