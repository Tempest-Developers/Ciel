const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
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
                .setDescription('Toggle manual summon cooldown ping notifications')),

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
            let responseMessage;

            if (subcommand === 'tier') {
                // Toggle the tier display setting
                toggleResult = await interaction.client.database.toggleAllowRolePing(guildId);
                responseMessage = `Tier display in summon messages ${toggleResult.allowRolePing ? 'enabled' : 'disabled'} for this server.`;
            } 
            else if (subcommand === 'ping') {
                // Toggle the cooldown ping setting
                toggleResult = await interaction.client.database.toggleAllowCooldownPing(guildId);
                responseMessage = `Manual summon cooldown pings ${toggleResult.allowCooldownPing ? 'enabled' : 'disabled'} for this server.`;
            }

            console.log(`${interaction.guild.name} - ${subcommand}: ${JSON.stringify(toggleResult)}`);

            await handleInteraction(interaction, {
                content: responseMessage,
                ephemeral: true
            }, 'editReply');

        } catch (error) {
            await handleCommandError(interaction, error, 'There was an error while executing this command.');
        }
    },
};
