const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { ensureUser } = require('../utils/database');

const INTERACTION_TIMEOUT = 300000; // 5 minutes
const USERS_PER_PAGE = 15;
const MAX_PAGES = 15;

const createTopEmbed = async (interaction, database, sortType, page = 1, totalPages) => {
    // Aggregate query to get top users sorted by specified currency type
    const sortField = sortType === 'tickets' ? 'currency.5' : 'currency.0';
    const aggregationPipeline = [
        { $match: { 'currency.5': { $exists: true } } }, // Ensure users have currency data
        { $sort: { [sortField]: -1 } },
        { $skip: (page - 1) * USERS_PER_PAGE },
        { $limit: USERS_PER_PAGE }
    ];

    const topUsers = await database.mGateDB.aggregate(aggregationPipeline).toArray();

    // Calculate total economy stats
    const economyStats = await database.mGateDB.aggregate([
        { $group: {
            _id: null,
            totalSlimeTokens: { $sum: '$currency.0' },
            totalTickets: { $sum: '$currency.5' },
            premiumUsers: { $sum: { $cond: [{ $eq: ['$premium.active', true] }, 1, 0] } }
        }}
    ]).toArray();

    const embed = new EmbedBuilder()
        .setTitle(`Top ${sortType.charAt(0).toUpperCase() + sortType.slice(1)} Leaderboard`)
        .setColor('#7289DA');

    // Add economy stats to the embed
    if (economyStats[0]) {
        embed.setDescription(
            `**Economy Stats:**\n` +
            `🪙 Total Slime Tokens: ${economyStats[0].totalSlimeTokens.toLocaleString()}\n` +
            `🎫 Total Tickets: ${economyStats[0].totalTickets.toLocaleString()}\n` +
            `👑 Premium Users: ${economyStats[0].premiumUsers}`
        );
    }

    // Create leaderboard entries
    const leaderboardEntries = await Promise.all(topUsers.map(async (userData, index) => {
        const user = await interaction.client.users.fetch(userData.userID).catch(() => null);
        const username = user ? user.username : userData.userID;
        const rank = (page - 1) * USERS_PER_PAGE + index + 1;
        const value = sortType === 'tickets' ? userData.currency[5] : userData.currency[0];
        
        return `**${rank}.** ${username}: ${sortType === 'tickets' ? '🎫' : '<:Slime_Token:1304929154285703179>'} ${value.toLocaleString()}`;
    }));

    embed.addFields({
        name: `Top ${USERS_PER_PAGE} Users (Page ${page}/${totalPages})`,
        value: leaderboardEntries.join('\n') || 'No users found'
    });

    embed.setFooter({ text: `Sorted by ${sortType}` });

    return embed;
};

const createNavigationButtons = (currentPage, totalPages, sortType) => {
    const row = new ActionRowBuilder();
    
    row.addComponents(
        new ButtonBuilder()
            .setCustomId(`first_${sortType}`)
            .setLabel('<<')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage === 1),
        new ButtonBuilder()
            .setCustomId(`prev_${sortType}`)
            .setLabel('<')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage === 1),
        new ButtonBuilder()
            .setCustomId(`tickets_${sortType === 'tickets' ? 'active' : 'inactive'}`)
            .setLabel('🎫 Tickets')
            .setStyle(sortType === 'tickets' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`slime_${sortType === 'slime' ? 'active' : 'inactive'}`)
            .setLabel('<:Slime_Token:1304929154285703179> Slime')
            .setStyle(sortType === 'slime' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`next_${sortType}`)
            .setLabel('>')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage === totalPages)
    );

    return row;
};

module.exports = {
    subcommand: subcommand =>
        subcommand
            .setName('top')
            .setDescription('View top users by tickets or slime tokens (Leads only)'),

    async execute(interaction, { database, config }) {
        // Check if user is a lead
        if (!config.leads.includes(interaction.user.id)) {
            return interaction.reply({
                content: '❌ Only leads can view the top leaderboard.',
                ephemeral: true
            });
        }

        try {
            await interaction.deferReply();

            let sortType = 'tickets'; // Default sort type
            const totalUsers = await database.mGateDB.countDocuments({ 'currency.5': { $exists: true } });
            const totalPages = Math.min(Math.ceil(totalUsers / USERS_PER_PAGE), MAX_PAGES);
            let currentPage = 1;

            const initialEmbed = await createTopEmbed(interaction, database, sortType, currentPage, totalPages);
            const components = totalPages > 1 ? [createNavigationButtons(currentPage, totalPages, sortType)] : [];
            
            const response = await interaction.editReply({
                embeds: [initialEmbed],
                components
            });

            if (totalPages > 1) {
                const collector = response.createMessageComponentCollector({
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

                        let newSortType = sortType;
                        let newPage = currentPage;

                        // Handle page navigation
                        switch (i.customId.split('_')[0]) {
                            case 'first':
                                newPage = 1;
                                break;
                            case 'prev':
                                newPage = Math.max(1, currentPage - 1);
                                break;
                            case 'next':
                                newPage = Math.min(totalPages, currentPage + 1);
                                break;
                            case 'tickets':
                                newSortType = 'tickets';
                                newPage = 1;
                                break;
                            case 'slime':
                                newSortType = 'slime';
                                newPage = 1;
                                break;
                        }

                        const newEmbed = await createTopEmbed(interaction, database, newSortType, newPage, totalPages);
                        await i.update({
                            embeds: [newEmbed],
                            components: [createNavigationButtons(newPage, totalPages, newSortType)]
                        }).catch(error => {
                            console.error('Failed to update interaction:', error);
                            collector.stop('updateFailed');
                        });

                        currentPage = newPage;
                        sortType = newSortType;
                    } catch (error) {
                        console.error('Error handling button interaction:', error);
                        try {
                            await i.reply({
                                content: 'An error occurred while processing your request.',
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
                        } else {
                            await response.edit({
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
            await interaction.editReply({
                content: 'An error occurred while fetching the leaderboard. Please try again later.',
                ephemeral: true
            });
        }
    }
};
