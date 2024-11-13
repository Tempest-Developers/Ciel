const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { ensureUser } = require('../utils/database');

const INTERACTION_TIMEOUT = 900000; // 15 minutes
const USERS_PER_PAGE = 15;
const MAX_PAGES = 15;

const createTopEmbed = async (interaction, database, sortType, page = 1, totalPages) => {
    try {
        // Aggregate query to get top users sorted by specified currency type
        const sortField = sortType === 'tickets' ? 'currency.5' : 'currency.0';
        const aggregationPipeline = [
            { $match: { 'currency.5': { $exists: true } } }, // Ensure users have currency data
            { $sort: { [sortField]: -1 } },
            { $skip: (page - 1) * USERS_PER_PAGE },
            { $limit: USERS_PER_PAGE }
        ];

        const topUsers = await database.mGateDB.aggregate(aggregationPipeline).toArray();
        if (!topUsers) {
            throw new Error('Failed to fetch top users from database');
        }

        // Calculate total economy stats
        const economyStats = await database.mGateDB.aggregate([
            { $group: {
                _id: null,
                totalSlimeTokens: { $sum: '$currency.0' },
                totalTickets: { $sum: '$currency.5' },
                premiumUsers: { $sum: { $cond: [{ $eq: ['$premium.active', true] }, 1, 0] } }
            }}
        ]).toArray().catch(error => {
            console.error('Failed to fetch economy stats:', error);
            return [{ totalSlimeTokens: 0, totalTickets: 0, premiumUsers: 0 }];
        });

        // Calculate page totals
        let pageSlimeTotal = 0;
        let pageTicketsTotal = 0;
        topUsers.forEach(user => {
            pageSlimeTotal += user.currency[0] || 0;
            pageTicketsTotal += user.currency[5] || 0;
        });

        const embed = new EmbedBuilder()
            .setTitle(`Top ${sortType.charAt(0).toUpperCase() + sortType.slice(1)} Leaderboard`)
            .setColor('#7289DA');

        // Add economy stats to the embed
        if (economyStats[0]) {
            embed.setDescription(
                `**Economy Stats:**\n` +
                `🪙 Total Slime Tokens: ${economyStats[0].totalSlimeTokens.toLocaleString()}\n` +
                `🎫 Total Tickets: ${economyStats[0].totalTickets.toLocaleString()}\n` +
                `👑 Premium Users: ${economyStats[0].premiumUsers}\n\n` +
                `**Current Page Totals:**\n` +
                `🪙 Page Slime Tokens: ${pageSlimeTotal.toLocaleString()}\n` +
                `🎫 Page Tickets: ${pageTicketsTotal.toLocaleString()}`
            );
        }

        // Create leaderboard entries
        const leaderboardEntries = await Promise.all(topUsers.map(async (userData, index) => {
            try {
                const user = await interaction.client.users.fetch(userData.userID).catch(() => null);
                const username = user ? user.username : `User ${userData.userID}`;
                const rank = (page - 1) * USERS_PER_PAGE + index + 1;
                const value = sortType === 'tickets' ? userData.currency[5] : userData.currency[0];
                
                return `**${rank}.** ${username}: ${sortType === 'tickets' ? '🎫' : 'Slime token'} ${value.toLocaleString()}`;
            } catch (error) {
                console.error(`Error creating leaderboard entry for user ${userData.userID}:`, error);
                return `**${(page - 1) * USERS_PER_PAGE + index + 1}.** Unknown User: ${sortType === 'tickets' ? '🎫' : 'Slime token'} 0`;
            }
        }));

        embed.addFields({
            name: `Top ${USERS_PER_PAGE} Users (Page ${page}/${totalPages})`,
            value: leaderboardEntries.join('\n') || 'No users found'
        });

        embed.setFooter({ text: `Sorted by ${sortType} • Page ${page}/${totalPages}` });

        return embed;
    } catch (error) {
        console.error('Error creating top embed:', error);
        throw error;
    }
};

const createNavigationButtons = (currentPage, totalPages) => {
    try {
        const row = new ActionRowBuilder();
        
        row.addComponents(
            new ButtonBuilder()
                .setCustomId('first')
                .setLabel('<<')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(currentPage === 1),
            new ButtonBuilder()
                .setCustomId('prev')
                .setLabel('<')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(currentPage === 1),
            new ButtonBuilder()
                .setCustomId('next')
                .setLabel('>')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(currentPage === totalPages)
        );

        return row;
    } catch (error) {
        console.error('Error creating navigation buttons:', error);
        throw error;
    }
};

module.exports = {
    subcommand: subcommand =>
        subcommand
            .setName('top')
            .setDescription('View top users by tickets or slime tokens (Leads only)')
            .addStringOption(option =>
                option.setName('type')
                    .setDescription('Sort by tickets or slime tokens')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Tickets', value: 'tickets' },
                        { name: 'Slime Tokens', value: 'slime' }
                    )
            ),

    async execute(interaction, { database, config }) {
        let collector = null;
        
        try {
            // Check if user is a lead
            if (!config.leads.includes(interaction.user.id)) {
                return interaction.reply({
                    content: '❌ Only leads can view the top leaderboard.',
                    ephemeral: true
                });
            }

            await interaction.deferReply();

            // Validate database connection
            if (!database || !database.mGateDB) {
                throw new Error('Database connection not available');
            }

            // Get sort type from command option
            const sortType = interaction.options.getString('type');

            const totalUsers = await database.mGateDB.countDocuments({ 'currency.5': { $exists: true } })
                .catch(error => {
                    console.error('Error counting total users:', error);
                    return 0;
                });

            if (totalUsers === 0) {
                return interaction.editReply({
                    content: 'No users found in the database.',
                    ephemeral: true
                });
            }

            const totalPages = Math.min(Math.ceil(totalUsers / USERS_PER_PAGE), MAX_PAGES);
            let currentPage = 1;

            const initialEmbed = await createTopEmbed(interaction, database, sortType, currentPage, totalPages);
            const components = totalPages > 1 ? [createNavigationButtons(currentPage, totalPages)] : [];
            
            const response = await interaction.editReply({
                embeds: [initialEmbed],
                components
            });

            if (totalPages > 1) {
                collector = response.createMessageComponentCollector({
                    componentType: ComponentType.Button,
                    time: INTERACTION_TIMEOUT
                });

                collector.on('collect', async i => {
                    try {
                        if (i.user.id !== interaction.user.id) {
                            await i.reply({ 
                                content: 'You cannot use these buttons.', 
                                ephemeral: true 
                            });
                            return;
                        }

                        let newPage = currentPage;

                        // Handle page navigation
                        switch (i.customId) {
                            case 'first':
                                newPage = 1;
                                break;
                            case 'prev':
                                newPage = Math.max(1, currentPage - 1);
                                break;
                            case 'next':
                                newPage = Math.min(totalPages, currentPage + 1);
                                break;
                            default:
                                throw new Error('Invalid button interaction');
                        }

                        const newEmbed = await createTopEmbed(interaction, database, sortType, newPage, totalPages);
                        await i.update({
                            embeds: [newEmbed],
                            components: [createNavigationButtons(newPage, totalPages)]
                        }).catch(error => {
                            console.error('Failed to update interaction:', error);
                            if (collector) collector.stop('updateFailed');
                        });

                        currentPage = newPage;
                    } catch (error) {
                        console.error('Error handling button interaction:', error);
                        try {
                            await i.reply({
                                content: 'An error occurred while processing your request. Please try again.',
                                ephemeral: true
                            });
                        } catch (replyError) {
                            console.error('Failed to send error message:', replyError);
                        }
                    }
                });

                collector.on('end', async (collected, reason) => {
                    try {
                        if (reason === 'updateFailed') {
                            await interaction.editReply({
                                content: 'This leaderboard has expired. Please run the command again.',
                                embeds: [],
                                components: []
                            }).catch(console.error);
                        } else if (reason === 'time') {
                            await interaction.editReply({
                                content: 'This leaderboard has expired due to inactivity. Please run the command again.',
                                embeds: [],
                                components: []
                            }).catch(console.error);
                        } else {
                            // Remove buttons but keep the embed
                            const lastEmbed = await createTopEmbed(interaction, database, sortType, currentPage, totalPages);
                            await interaction.editReply({
                                embeds: [lastEmbed],
                                components: []
                            }).catch(console.error);
                        }
                    } catch (error) {
                        console.error('Failed to cleanup after collector end:', error);
                    }
                });
            }

        } catch (error) {
            console.error('Error in top command:', error);
            
            // Cleanup collector if it exists
            if (collector) {
                collector.stop();
            }

            // Send error message
            const errorMessage = 'An error occurred while fetching the leaderboard. Please try again later.';
            if (interaction.deferred) {
                await interaction.editReply({
                    content: errorMessage,
                    ephemeral: true
                }).catch(console.error);
            } else {
                await interaction.reply({
                    content: errorMessage,
                    ephemeral: true
                }).catch(console.error);
            }
        }
    }
};
