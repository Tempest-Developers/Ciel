const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Replies with Pong!'),
        developerOnly: true, // Make this command developer-only
    async execute(interaction) {
        try {
            await interaction.deferReply(); // Send a temporary response

            const sent = await interaction.editReply({ content: 'Pinging...', fetchReply: true });
            const pingTime = sent.createdTimestamp - interaction.createdTimestamp;

            await interaction.editReply(
                `Pong! Bot Latency: ${pingTime}ms, API Latency: ${interaction.client.ws.ping}ms`
            );
        } catch (error) {
            console.error(error); // Log the error
            await interaction.editReply('An error occurred while processing the command.');
        }
    },
};
