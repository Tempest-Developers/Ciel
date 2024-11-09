const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Shows information about available commands'),
    
    async execute(interaction) {
        try {
            const helpEmbed = new EmbedBuilder()
                .setTitle('Available Commands')
                .setColor('#FFC0CB')
                .setDescription('Here are the available commands you can use:')
                .addFields(
                    {
                        name: '`/recent`',
                        value: 'View recent card claims with tier filtering',
                        inline: false
                    },
                    {
                        name: '`/search`',
                        value: 'Search cards with autocomplete',
                        inline: false
                    },
                    {
                        name: '`/stats`',
                        value: 'View user card statistics and print ranges',
                        inline: false
                    },
                    {
                        name: '`/serverstats`',
                        value: 'View server-wide card statistics and print ranges',
                        inline: false
                    },
                    {
                        name: '`/leaderboard`',
                        value: 'View server leaderboards:\n• `/leaderboard tier` - Rankings by specific card tier\n• `/leaderboard print` - Rankings by print ranges\n• `/leaderboard total` - Overall claim rankings',
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
