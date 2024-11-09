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
                        value: 'View the last 15 card claims with tier filtering options. You can filter claims by tier (C, R, SR, SSR) using the dropdown menu.',
                        inline: false
                    },
                    {
                        name: '`/search`',
                        value: 'Search through all available cards. Shows detailed card information including owners, prints, and your copies. Features autocomplete for easy searching.',
                        inline: false
                    },
                    {
                        name: '`/stats`',
                        value: 'View server statistics for card claims, including tier percentages, counts, and recent claims with their timestamps.',
                        inline: false
                    }
                )
                .setFooter({ text: 'Use these commands to interact with the bot!' });

            await interaction.reply({ embeds: [helpEmbed], ephemeral: true });
        } catch (error) {
            console.error('Error executing help command:', error);
            await interaction.reply({ 
                content: 'An error occurred while showing the help information.',
                ephemeral: true 
            });
        }
    },
};
