const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { handleInteraction, handleCommandError, safeDefer } = require('../utility/interactionHandler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sconfig')
        .setDescription('Configure server features')
        .setDefaultMemberPermissions(PermissionFlagsBits.ADMINISTRATOR | PermissionFlagsBits.MANAGE_ROLES | PermissionFlagsBits.MANAGE_MESSAGES)
        .addSubcommand(subcommand =>
            subcommand
                .setName('tier')
                .setDescription('Toggle tier display in summon messages'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('ping')
                .setDescription('Toggle manual summon cooldown ping notifications'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('View current server configuration settings')),

    async execute(interaction) {
        try {
            await safeDefer(interaction, { ephemeral: true });

            const guildId = interaction.guild.id;
            const subcommand = interaction.options.getSubcommand();
            
            // Get server settings using database function
            let serverData = await interaction.client.database.getServerSettings(guildId);
            
            if (!serverData) {
                await interaction.client.database.createServerSettings(guildId);
                serverData = await interaction.client.database.getServerSettings(guildId);
            }

            let toggleResult;
            let responseEmbed;

            if (subcommand === 'tier') {
                // Toggle the tier display setting
                toggleResult = await interaction.client.database.toggleAllowRolePing(guildId);
                responseEmbed = new EmbedBuilder()
                    .setColor('#2B2D31')
                    .setTitle('Server Configuration Updated')
                    .setDescription(`Tier display in summon messages ${toggleResult.allowShowStats ? 'enabled' : 'disabled'} for this server.`)
                    .setTimestamp();
            } 
            else if (subcommand === 'ping') {
                // Toggle the cooldown ping setting
                toggleResult = await interaction.client.database.toggleAllowCooldownPing(guildId);
                responseEmbed = new EmbedBuilder()
                    .setColor('#2B2D31')
                    .setTitle('Server Configuration Updated')
                    .setDescription(`Manual summon cooldown pings ${toggleResult.allowCooldownPing ? 'enabled' : 'disabled'} for this server.`)
                    .setTimestamp();
            }
            else if (subcommand === 'status') {
                // Display current server configuration status
                responseEmbed = new EmbedBuilder()
                    .setColor('#2B2D31')
                    .setTitle('Server Configuration Status')
                    .addFields(
                        { 
                            name: 'Tier Display', 
                            value: serverData.settings.allowShowStats ? 'Enabled ✅' : 'Disabled ❌', 
                            inline: true 
                        },
                        { 
                            name: 'Cooldown Ping Notifications', 
                            value: serverData.settings.allowCooldownPing ? 'Enabled ✅' : 'Disabled ❌', 
                            inline: true 
                        }
                    )
                    .setTimestamp()
                    .setFooter({ text: `Server ID: ${guildId}` });
            }

            console.log(`${interaction.guild.name} - ${subcommand}: ${JSON.stringify(toggleResult || serverData)}`);

            await handleInteraction(interaction, {
                embeds: [responseEmbed],
                ephemeral: true
            }, 'editReply');

        } catch (error) {
            await handleCommandError(interaction, error, 'There was an error while executing this command.');
        }
    },
};
