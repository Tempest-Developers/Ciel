const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

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
                        .setRequired(true))),

    async execute(interaction) {
        try {
            // Only allow specific user to use this command
            if (interaction.user.id !== '292675388180791297') {
                return await interaction.reply({
                    content: 'You are not authorized to use this command.',
                    ephemeral: true
                });
            }

            const { mServerSettingsDB } = await interaction.client.database.connectDB();
            const subcommand = interaction.options.getSubcommand(false);

            if (subcommand === 'server') {
                const serverId = interaction.options.getString('id');
                const serverSettings = await mServerSettingsDB.findOne({ serverID: serverId });
                
                if (!serverSettings) {
                    return await interaction.reply({
                        content: `No settings found for server ${serverId}`,
                        ephemeral: true
                    });
                }

                const guild = await interaction.client.guilds.fetch(serverId).catch(() => null);
                const guildName = guild ? guild.name : 'Unknown Server';

                const embed = new EmbedBuilder()
                    .setTitle(`🔧 Server Settings: ${guildName}`)
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
            } else {
                // Default behavior - list all servers
                const allSettings = await mServerSettingsDB.find({}).toArray();
                const guilds = await interaction.client.guilds.fetch();
                
                const embed = new EmbedBuilder()
                    .setTitle('🌐 Server Settings Overview')
                    .setColor(0x0099ff)
                    .setTimestamp();

                let description = '';
                for (const settings of allSettings) {
                    const guild = guilds.get(settings.serverID);
                    if (!guild) continue; // Skip if bot is no longer in server
                    
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

                    description += `\n**${guild.name}** (${settings.serverID})\n`;
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
