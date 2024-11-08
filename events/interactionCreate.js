const { Events } = require('discord.js');
const { checkPermissions } = require('../utility/auth');

module.exports = {
    name: Events.InteractionCreate,
    once: false,
    async execute(client, interaction) {

        // New permission check
        if (!checkPermissions(interaction.channel, interaction.client.user)) return;

        // Handle autocomplete interactions
        if (interaction.isAutocomplete()) {
            const command = interaction.client.slashCommands.get(interaction.commandName);
            if (!command || !command.autocomplete) return;

            try {
                await command.autocomplete(interaction);
            } catch (error) {
                console.error(error);
            }
            return;
        }

        if (!interaction.isChatInputCommand()) return;

        const command = interaction.client.slashCommands.get(interaction.commandName);
        if (!command) return;

        const { developers, admins } = interaction.client.config;
        const isAdmin = admins.includes(interaction.user.id);
        const isDeveloper = developers.includes(interaction.user.id);

        // Check permissions
        if (command.developerOnly && !isDeveloper) {
            try {
                return await interaction.reply({ 
                    content: 'This command is only available to developers.', 
                    ephemeral: true 
                });
            } catch (error) {
                console.error('Failed to reply to permission check:', error);
                return;
            }
        }

        if (command.adminOnly && !isAdmin && !isDeveloper) {
            try {
                return await interaction.reply({ 
                    content: 'This command is only available to administrators.', 
                    ephemeral: true 
                });
            } catch (error) {
                console.error('Failed to reply to permission check:', error);
                return;
            }
        }

        try {
            await command.execute(interaction, { database: interaction.client.database });
        } catch (error) {
            console.error('Command execution error:', error);
            
            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ 
                        content: 'There was an error while executing this command!', 
                        ephemeral: true 
                    });
                } else if (interaction.deferred) {
                    await interaction.editReply({
                        content: 'There was an error while executing this command!',
                    });
                }
            } catch (replyError) {
                console.error('Failed to send error message:', replyError);
            }
        }
    },
};
