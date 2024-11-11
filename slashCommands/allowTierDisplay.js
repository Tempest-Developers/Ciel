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
            let serverData = await interaction.client.database.mServerSettingDB.findOne({ serverID: guildId });
            
            if (!serverData) {
                serverData = await interaction.client.database.mServerSettingDB.create({
                    serverID: guildId,
                    allowRolePing: false
                });
            }

            // Toggle the setting
            const newValue = !serverData.allowRolePing;
            await interaction.client.database.mServerSettingDB.updateOne(
                { serverID: guildId },
                { $set: { allowRolePing: newValue } }
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
