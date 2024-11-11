const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('allowtierdisplay')
        .setDescription('Toggle the High Tier role ping feature for this server')
        .setDefaultMemberPermissions(PermissionFlagsBits.ADMINISTRATOR | PermissionFlagsBits.MANAGE_ROLES | PermissionFlagsBits.MANAGE_MESSAGES),

    async execute(interaction) {
        try {
            const guildId = interaction.guild.id;
            
            // Get server settings
            let serverData = await interaction.client.database.mServerSettingsDB.findOne({ serverID: guildId });
            
            if (!serverData) {
                serverData = await interaction.client.database.mServerSettingsDB.insertOne({
                    serverID: guildId,
                    settings: {
                        allowShowStats: true,
                        allowRolePing: false
                    }
                });
                serverData = await interaction.client.database.mServerSettingsDB.findOne({ serverID: guildId });
            }

            // Toggle the setting
            const newValue = !serverData.settings.allowRolePing;
            await interaction.client.database.mServerSettingsDB.updateOne(
                { serverID: guildId },
                { $set: { 'settings.allowRolePing': newValue } }
            );

            await interaction.reply({
                content: `High Tier role ping feature has been ${newValue ? 'enabled' : 'disabled'} for this server.`,
                ephemeral: true
            });

        } catch (error) {
            console.error('Error in allowTierDisplay command:', error);
            await interaction.reply({
                content: 'There was an error while executing this command.',
                ephemeral: true
            });
        }
    },
};
