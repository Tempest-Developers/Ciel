const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('allowtierdisplay')
        .setDescription('Toggle the High Tier role ping feature for this server')
        .setDefaultMemberPermissions(PermissionFlagsBits.ADMINISTRATOR | PermissionFlagsBits.MANAGE_ROLES | PermissionFlagsBits.MANAGE_MESSAGES),

    async execute(interaction) {
        return await interaction.reply({
            content: 'Command unavailable for this server.',
            ephemeral: true
        });
        try {
            const guildId = interaction.guild.id;
            
            // Get server settings using the correct property name
            let serverData = await interaction.client.database.serverSettings.findOne({ serverID: guildId });
            
            if (!serverData) {
                serverData = await interaction.client.database.serverSettings.insertOne({
                    serverID: guildId,
                    settings: {
                        allowShowStats: true,
                        allowRolePing: false
                    }
                });
                serverData = await interaction.client.database.serverSettings.findOne({ serverID: guildId });
            }

            // Toggle the setting
            const newValue = !serverData.settings.allowRolePing;
            await interaction.client.database.serverSettings.updateOne(
                { serverID: guildId },
                { $set: { 'settings.allowRolePing': newValue } }
            );

            console.log(interaction.guild.name+" "+newValue)

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
