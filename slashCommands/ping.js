const { SlashCommandBuilder } = require('discord.js');
const { handleInteraction, handleCommandError, safeDefer } = require('../utility/interactionHandler');

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
        try {
            // Add cooldown check
            const guildId = interaction.guild.id;
            const userId = interaction.user.id;
            const cooldownKey = `${guildId}-${userId}`;
            
            if (cooldowns.has(cooldownKey)) {
                const expirationTime = cooldowns.get(cooldownKey);
                if (Date.now() < expirationTime) {
                    const timeLeft = (expirationTime - Date.now()) / 1000;
                    return await handleInteraction(interaction, { 
                        content: `Please wait ${timeLeft.toFixed(1)} seconds before using this command again.`,
                        ephemeral: true 
                    });
                }
            }

            // Set cooldown
            cooldowns.set(cooldownKey, Date.now() + COOLDOWN_DURATION);
            setTimeout(() => cooldowns.delete(cooldownKey), COOLDOWN_DURATION);

            await safeDefer(interaction, { ephemeral: true });

            const sent = await handleInteraction(interaction, { 
                content: 'Pinging...',
                fetchReply: true 
            }, 'editReply');

            const pingTime = sent.createdTimestamp - interaction.createdTimestamp;

            await handleInteraction(interaction, {
                content: `Pong! Bot Latency: ${pingTime}ms, API Latency: ${interaction.client.ws.ping}ms`,
                ephemeral: true,
            }, 'editReply');

        } catch (error) {
            await handleCommandError(interaction, error, 'An error occurred while processing the command.');
        }
    },
};
