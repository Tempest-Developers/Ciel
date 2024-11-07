const { Events } = require('discord.js');

module.exports = {
    name: Events.InteractionCreate,
    once: false,
    async execute(client, interaction) {
       // Handle autocomplete interactions
        try {
            if (interaction.isAutocomplete()) {
                const command = interaction.client.slashCommands.get(interaction.commandName);
                if (!command || !command.autocomplete) throw new Error('Command not found or autocomplete not defined');

                await command.autocomplete(interaction);
                return;
            }

            if (!interaction.isChatInputCommand()) throw new Error('Not a chat input command');

            const { developers, admins } = interaction.client.config;

            const command = interaction.client.slashCommands.get(interaction.commandName);

            // Developer and Admin check
            if ((command.adminOnly || command.developerOnly) && 
                !admins.includes(interaction.user.id) && 
                !developers.includes(interaction.user.id)) {
                throw new Error('Unauthorized access');
            }

            if (!command) throw new Error('Command not found');

            await command.execute(interaction, { database: interaction.client.database });
        } catch (error) {
            console.error(error);
            if (interaction.replied) {
                await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
            } else {
                await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
            }
        }
    }
};
