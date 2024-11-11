const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

// Add cooldown system
const cooldowns = new Map();
const COOLDOWN_DURATION = 5000; // 5 seconds in milliseconds

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Shows information about available commands'),
    
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
            const helpEmbed = new EmbedBuilder()
                .setTitle('Available Commands')
                .setColor('#FFC0CB')
                .setDescription('Here are the available commands you can use:')
                .addFields(
                    {
                        name: '`/leaderboard`',
                        value: 'View server leaderboards with multiple options:\n' +
                               '• `/leaderboard tier` - Rankings by specific card tier (SSR, SR, R, C)\n' +
                               '• `/leaderboard print` - Rankings by print ranges (#1-10, #11-50, #51-100, etc.)\n' +
                               '• `/leaderboard total` - Overall claim rankings for all cards',
                        inline: false
                    },
                    {
                        name: '`/mystats`',
                        value: 'View your personal card collection statistics:\n' +
                               '• Total cards claimed\n' +
                               '• Breakdown by tier (SSR to C)\n' +
                               '• Print number ranges\n' +
                               '• Collection completion status',
                        inline: false
                    },
                    {
                        name: '`/recent`',
                        value: 'View recent card claims with filtering options:\n' +
                               '• Filter by specific tier (SSR, SR, R, C)\n' +
                               '• View claim timestamps\n' +
                               '• See print numbers\n' +
                               '• Check who claimed specific cards',
                        inline: false
                    },
                    {
                        name: '`/search`',
                        value: 'Search for specific cards with advanced features:\n' +
                               '• Autocomplete suggestions as you type\n' +
                               '• Search by character name\n' +
                               '• View card details including tier and availability\n' +
                               '• Check claim status and ownership',
                        inline: false
                    },
                    {
                        name: '`/server`',
                        value: 'View comprehensive server statistics:\n' +
                               '• Total cards claimed on server\n' +
                               '• Server-wide tier distribution\n' +
                               '• Print number statistics\n' +
                               '• Most active collectors\n' +
                               '• Recent server activity',
                        inline: false
                    }
                )
                .setFooter({ text: 'Use these commands to interact with the bot!' });

            await interaction.reply({ embeds: [helpEmbed], ephemeral: true });
        } catch (error) {
            console.error('Error executing help command:', error);
            await interaction.reply({ 
                content: 'An error occurred while showing the help information.',
                ephemeral: false 
            });
        }
    },
};
