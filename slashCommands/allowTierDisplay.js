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
            const toggleResult = await interaction.client.database.toggleAllowRolePing(guildId);

            console.log(interaction.guild.name+" "+toggleResult.allowRolePing)

            await interaction.reply({
                content: `Displays tiers preview info ${toggleResult.allowRolePing ? 'enabled' : 'disabled'} for this server.`,
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
