const { SlashCommandBuilder } = require('discord.js');

// Add cooldown system
const cooldowns = new Map();
const COOLDOWN_DURATION = 5000; // 5 seconds in milliseconds

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Replies with Pong!'),
    developerOnly: false,
    adminOnly: true,
    async execute(interaction) {
        // Add cooldown check
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const cooldownKey = `${guildId}-${userId}`;
        
        if (cooldowns.has(cooldownKey)) {
            const expirationTime = cooldowns.get(cooldownKey);
            if (Date.now() < expirationTime) {
                const timeLeft = (expirationTime - Date.now()) / 1000;
                return await interaction.reply({ 
                    content: `Please wait ${timeLeft.toFixed(1)} seconds before using this command again.`,
                    ephemeral: true 
                });
            }
        }

        // Set cooldown
        cooldowns.set(cooldownKey, Date.now() + COOLDOWN_DURATION);
        setTimeout(() => cooldowns.delete(cooldownKey), COOLDOWN_DURATION);

        try {
            await interaction.deferReply({ ephemeral: true });

            const sent = await interaction.editReply({ content: 'Pinging...', fetchReply: true });
            const pingTime = sent.createdTimestamp - interaction.createdTimestamp;

            await interaction.editReply({
                content: `Pong! Bot Latency: ${pingTime}ms, API Latency: ${interaction.client.ws.ping}ms`,
                ephemeral: true,
            });
        } catch (error) {
            console.error(error);
            await interaction.editReply({
                content: 'An error occurred while processing the command.',
                ephemeral: true,
            });
        }
    },
};
