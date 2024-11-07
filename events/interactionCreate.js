const { Events } = require('discord.js');

module.exports = {
	name: Events.InteractionCreate,
	once: false,
	async execute(client, interaction) {
		if (!interaction.isChatInputCommand()) return;

		const { developers, admins } = interaction.client.config;

		const command = interaction.client.slashCommands.get(interaction.commandName);

		// Developer and Admin check
        if ((command.adminOnly || command.developerOnly) && 
            !admins.includes(interaction.author.id) && 
            !developers.includes(interaction.author.id)) {
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
