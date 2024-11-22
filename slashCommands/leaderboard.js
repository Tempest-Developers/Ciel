const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const getTierEmoji = require('../utility/getTierEmoji');
const { handleInteraction, handleCommandError, safeDefer } = require('../utility/interactionHandler');

// Add cooldown system
const cooldowns = new Map();
const COOLDOWN_DURATION = 5000; // 5 seconds in milliseconds

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Shows server leaderboard for card claims')
        .addSubcommand(subcommand =>
            subcommand
                .setName('tier')
                .setDescription('Show leaderboard for a specific tier')
                .addStringOption(option =>
                    option
                        .setName('tier')
                        .setDescription('Card tier to show')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Common Tier', value: 'CT' },
                            { name: 'Rare Tier', value: 'RT' },
                            { name: 'Super Rare Tier', value: 'SRT' },
                            { name: 'Super Super Rare Tier', value: 'SSRT' },
                            { name: 'Ultra Rare Tier', value: 'URT' },
                            { name: 'Exclusive Tier', value: 'EXT' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('total')
                .setDescription('Show total claims leaderboard')
        ),

    async execute(interaction, { database }) {
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

        cooldowns.set(cooldownKey, Date.now() + COOLDOWN_DURATION);
        setTimeout(() => cooldowns.delete(cooldownKey), COOLDOWN_DURATION);

        await safeDefer(interaction);

        try {
            const subcommand = interaction.options.getSubcommand();

            // Get server settings to check if stats are allowed
            const serverSettings = await database.getServerSettings(guildId);
            if (!serverSettings?.settings?.allowShowStats) {
                return await handleInteraction(interaction, {
                    content: 'Stats are currently disabled in this server.',
                    ephemeral: true
                }, 'editReply');
            }

            const { mUserDB } = await database.connectDB();
            let leaderboardData;
            let title = '';
            let description = '';

            if (subcommand === 'tier') {
                const tier = interaction.options.getString('tier');
                const tierIndex = ['CT', 'RT', 'SRT', 'SSRT', 'URT', 'EXT'].indexOf(tier);
                title = `${getTierEmoji(tier)} ${tier} Leaderboard`;
                description = `Top 10 players by ${tier} claims`;

                // Optimized aggregation pipeline for tier leaderboard
                leaderboardData = await mUserDB.aggregate([
                    { 
                        $match: { 
                            [`servers.${guildId}`]: { $exists: true } 
                        } 
                    },
                    {
                        $project: {
                            userId: '$userID',
                            count: { $arrayElemAt: [`$servers.${guildId}.counts`, tierIndex] }
                        }
                    },
                    { 
                        $match: { 
                            count: { $gt: 0 } 
                        } 
                    },
                    { 
                        $sort: { count: -1 } 
                    }
                ]).toArray();

            } else if (subcommand === 'print') {
                const range = interaction.options.getString('range');
                
                if (range === 'ALL') {
                    title = '🖨️ All Prints Leaderboard';
                    description = 'Top 10 players by print ranges (Based on last 50 claims)';

                    // Optimized aggregation for all prints
                    leaderboardData = await mUserDB.aggregate([
                        { 
                            $match: { 
                                [`servers.${guildId}`]: { $exists: true },
                                $or: [
                                    { [`servers.${guildId}.claims`]: { $exists: true } },
                                    { [`servers.${guildId}.manualClaims`]: { $exists: true } }
                                ]
                            } 
                        },
                        {
                            $project: {
                                userId: '$userID',
                                allClaims: {
                                    $concatArrays: [
                                        { $ifNull: [`$servers.${guildId}.manualClaims`, []] },
                                        { $ifNull: [{ $arrayElemAt: [`$servers.${guildId}.claims.CT`, -50] }, []] },
                                        { $ifNull: [{ $arrayElemAt: [`$servers.${guildId}.claims.RT`, -50] }, []] },
                                        { $ifNull: [{ $arrayElemAt: [`$servers.${guildId}.claims.SRT`, -50] }, []] },
                                        { $ifNull: [{ $arrayElemAt: [`$servers.${guildId}.claims.SSRT`, -50] }, []] },
                                        { $ifNull: [{ $arrayElemAt: [`$servers.${guildId}.claims.URT`, -50] }, []] },
                                        { $ifNull: [{ $arrayElemAt: [`$servers.${guildId}.claims.EXT`, -50] }, []] }
                                    ]
                                }
                            }
                        },
                        {
                            $project: {
                                userId: 1,
                                SP: {
                                    $size: {
                                        $filter: {
                                            input: '$allClaims',
                                            as: 'claim',
                                            cond: { 
                                                $and: [
                                                    { $gte: ['$$claim.print', 1] },
                                                    { $lte: ['$$claim.print', 10] }
                                                ]
                                            }
                                        }
                                    }
                                },
                                LP: {
                                    $size: {
                                        $filter: {
                                            input: '$allClaims',
                                            as: 'claim',
                                            cond: { 
                                                $and: [
                                                    { $gte: ['$$claim.print', 11] },
                                                    { $lte: ['$$claim.print', 99] }
                                                ]
                                            }
                                        }
                                    }
                                },
                                MP: {
                                    $size: {
                                        $filter: {
                                            input: '$allClaims',
                                            as: 'claim',
                                            cond: { 
                                                $and: [
                                                    { $gte: ['$$claim.print', 100] },
                                                    { $lte: ['$$claim.print', 499] }
                                                ]
                                            }
                                        }
                                    }
                                },
                                HP: {
                                    $size: {
                                        $filter: {
                                            input: '$allClaims',
                                            as: 'claim',
                                            cond: { 
                                                $and: [
                                                    { $gte: ['$$claim.print', 500] },
                                                    { $lte: ['$$claim.print', 1000] }
                                                ]
                                            }
                                        }
                                    }
                                }
                            }
                        },
                        {
                            $addFields: {
                                total: { $add: ['$SP', '$LP', '$MP', '$HP'] }
                            }
                        },
                        {
                            $match: {
                                total: { $gt: 0 }
                            }
                        },
                        {
                            $sort: { total: -1 }
                        }
                    ]).toArray();

                } else {
                    const rangeEmoji = { SP: '⭐', LP: '🌟', MP: '💫', HP: '✨' };
                    title = `${rangeEmoji[range]} ${range} Leaderboard`;
                    description = `Top 10 players by ${range} (${getRangeDescription(range)}) (Based on last 50 claims)`;

                    const printRange = getPrintRange(range);
                    leaderboardData = await mUserDB.aggregate([
                        { 
                            $match: { 
                                [`servers.${guildId}`]: { $exists: true },
                                $or: [
                                    { [`servers.${guildId}.claims`]: { $exists: true } },
                                    { [`servers.${guildId}.manualClaims`]: { $exists: true } }
                                ]
                            } 
                        },
                        {
                            $project: {
                                userId: '$userID',
                                allClaims: {
                                    $concatArrays: [
                                        { $ifNull: [`$servers.${guildId}.manualClaims`, []] },
                                        { $ifNull: [{ $arrayElemAt: [`$servers.${guildId}.claims.CT`, -50] }, []] },
                                        { $ifNull: [{ $arrayElemAt: [`$servers.${guildId}.claims.RT`, -50] }, []] },
                                        { $ifNull: [{ $arrayElemAt: [`$servers.${guildId}.claims.SRT`, -50] }, []] },
                                        { $ifNull: [{ $arrayElemAt: [`$servers.${guildId}.claims.SSRT`, -50] }, []] },
                                        { $ifNull: [{ $arrayElemAt: [`$servers.${guildId}.claims.URT`, -50] }, []] },
                                        { $ifNull: [{ $arrayElemAt: [`$servers.${guildId}.claims.EXT`, -50] }, []] }
                                    ]
                                }
                            }
                        },
                        {
                            $project: {
                                userId: 1,
                                count: {
                                    $size: {
                                        $filter: {
                                            input: '$allClaims',
                                            as: 'claim',
                                            cond: { 
                                                $and: [
                                                    { $gte: ['$$claim.print', printRange.min] },
                                                    { $lte: ['$$claim.print', printRange.max] }
                                                ]
                                            }
                                        }
                                    }
                                }
                            }
                        },
                        {
                            $match: {
                                count: { $gt: 0 }
                            }
                        },
                        {
                            $sort: { count: -1 }
                        }
                    ]).toArray();
                }

            } else { // total
                title = '🏆 Total Claims Leaderboard';
                description = 'Top 10 players by total claims';

                // Optimized aggregation pipeline for total claims
                leaderboardData = await mUserDB.aggregate([
                    { 
                        $match: { 
                            [`servers.${guildId}`]: { $exists: true } 
                        } 
                    },
                    {
                        $project: {
                            userId: '$userID',
                            count: {
                                $reduce: {
                                    input: `$servers.${guildId}.counts`,
                                    initialValue: 0,
                                    in: { $add: ['$$value', { $ifNull: ['$$this', 0] }] }
                                }
                            }
                        }
                    },
                    { 
                        $match: { 
                            count: { $gt: 0 } 
                        } 
                    },
                    { 
                        $sort: { count: -1 } 
                    }
                ]).toArray();
            }

            // Create embed
            const embed = new EmbedBuilder()
                .setColor('#FFC0CB')
                .setTitle(title)
                .setDescription(description);

            // Add top 10 fields
            const top10 = leaderboardData.slice(0, 10);
            const leaderboardText = top10.map((data, index) => 
                `${index + 1}. <@${data.userId}> - ${data.count} claims`
            ).join('\n');

            embed.addFields({ name: 'Rankings', value: leaderboardText || 'No data available' });

            // Add user's rank if they exist in the data
            const userRank = leaderboardData.findIndex(data => data.userId === userId) + 1;
            const userData = leaderboardData.find(data => data.userId === userId);

            if (userRank > 0 && userData) {
                const userStats = `Your Claims: **${userData.count}** | Your Rank: #**${userRank}**/**${leaderboardData.length}**`;
                embed.addFields({ name: 'Your Statistics', value: userStats });
            }

            await handleInteraction(interaction, { embeds: [embed] }, 'editReply');

        } catch (error) {
            await handleCommandError(interaction, error, 'An error occurred while fetching the leaderboard.');
        }
    }
};

function getRangeDescription(range) {
    switch (range) {
        case 'SP': return '1-10';
        case 'LP': return '11-99';
        case 'MP': return '100-499';
        case 'HP': return '500-1000';
        default: return '';
    }
}

function getPrintRange(range) {
    switch (range) {
        case 'SP': return { min: 1, max: 10 };
        case 'LP': return { min: 11, max: 99 };
        case 'MP': return { min: 100, max: 499 };
        case 'HP': return { min: 500, max: 1000 };
        default: return { min: 0, max: 0 };
    }
}
