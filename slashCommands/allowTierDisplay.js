const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('allowtierdisplay')
        .setDescription('Toggle the tier display feature for this server')
        .setDefaultMemberPermissions(PermissionFlagsBits.ADMINISTRATOR | PermissionFlagsBits.MANAGE_ROLES | PermissionFlagsBits.MANAGE_MESSAGES),

    async execute(interaction) {
        try {
            const guildId = interaction.guild.id;
            // if(guildID!="1240866080985976844"){
            //     return await interaction.reply({
            //         content: 'Command unavailable for this server.',
            //         ephemeral: true
            //     });
            // }
            
            // Get server settings using database function
            let serverData = await interaction.client.database.getServerSettings(guildId);
            
            if (!serverData) {
                await interaction.client.database.createServerSettings(guildId);
                serverData = await interaction.client.database.getServerSettings(guildId);
            }

            // Toggle the setting
            const newValue = !serverData.settings.allowRolePing;
            await interaction.client.database.toggleRegister(guildId);

            console.log(interaction.guild.name+" "+newValue)

            await interaction.reply({
                content: `Displays tiers preview info ${newValue ? 'enabled' : 'disabled'} for this server.`,
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
