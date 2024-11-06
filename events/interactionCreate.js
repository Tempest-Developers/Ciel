const { Events } = require('discord.js');

module.exports = {
	name: Events.InteractionCreate,
	once: false,
	async execute(interaction) {
		if (!interaction.isChatInputCommand()) return;

		const { developers } = interaction.client.config;

		const command = interaction.client.slashCommands.get(interaction.commandName);

		// Developer check
		if (command.developerOnly && !developers.includes(interaction.user.id)) {
			return await interaction.reply({ content: ':scroll: | **Command unavilable**', ephemeral: true });
		}

		if (!command) return;

		try {
			await command.execute(interaction);
		} catch (error) {
			console.error(error);
			await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
		}
	},
};
