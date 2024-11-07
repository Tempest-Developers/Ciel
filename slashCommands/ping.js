const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Replies with Pong!'),
    developerOnly: false, // Make this command developer-only
    adminOnly:true,
    async execute(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true }); // Send a temporary response that's only visible to the user

            const sent = await interaction.editReply({ content: 'Pinging...', fetchReply: true });
            const pingTime = sent.createdTimestamp - interaction.createdTimestamp;

            await interaction.editReply({
                content: `Pong! Bot Latency: ${pingTime}ms, API Latency: ${interaction.client.ws.ping}ms`,
                ephemeral: true, // Make the reply only visible to the user
            });
        } catch (error) {
            console.error(error); // Log the error
            await interaction.editReply({
                content: 'An error occurred while processing the command.',
                ephemeral: true, // Make the error message only visible to the user
            });
        }
    },
};
