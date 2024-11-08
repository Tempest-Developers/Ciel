const { Events } = require('discord.js');

module.exports = {
    name: Events.InteractionCreate,
    once: false,
    async execute(client, interaction) {
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

        const { developers, admins } = interaction.client.config;

        const command = interaction.client.slashCommands.get(interaction.commandName);

        if ((command.adminOnly || command.developerOnly) && 
            !admins.includes(interaction.user.id) || 
            !developers.includes(interaction.user.id)) {
            return;
        }

        if (!command) return;

        try {
            await command.execute(interaction, { database: interaction.client.database });
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
        }
    },
};
