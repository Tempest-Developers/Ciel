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
                .setDescription('Here are the available commands:')
                .addFields(
                    {
                        name: '`/leaderboard`',
                        value: 'View rankings by tier, print ranges, or total claims',
                        inline: false
                    },
                    {
                        name: '`/mycards`',
                        value: 'View your card collection and manage your cards',
                        inline: false
                    },
                    {
                        name: '`/mystats`',
                        value: 'View your card collection stats and completion status',
                        inline: false
                    },
                    {
                        name: '`/recent`',
                        value: 'View recent card claims with tier filters',
                        inline: false
                    },
                    {
                        name: '`/search`',
                        value: 'Search cards by character name with autocomplete',
                        inline: false
                    },
                    {
                        name: '`/server`',
                        value: 'View server-wide card statistics and activity',
                        inline: false
                    },
                    {
                        name: '`/wishlist`',
                        value: 'View and manage your card wishlist',
                        inline: false
                    },
                    {
                        name: '🛡️ `/registerguild`',
                        value: 'Register your server for bot usage',
                        inline: false
                    },
                    {
                        name: '🛡️ Admin Commands',
                        value: '`/allowtierdisplay` - Toggle high tier role ping feature',
                        inline: false
                    }
                )
                .setFooter({ text: '🛡️ = Requires Admin/Manage Server permission' });

            await interaction.reply({ embeds: [helpEmbed], ephemeral: false });
        } catch (error) {
            console.error('Error executing help command:', error);
            await interaction.reply({ 
                content: 'An error occurred while showing the help information.',
                ephemeral: true 
            });
        }
    },
};
