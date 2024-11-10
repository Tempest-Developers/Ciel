const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const getTierEmoji = require('../utility/getTierEmoji');

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
                            { name: 'Super Super Rare Tier', value: 'SSRT' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('print')
                .setDescription('Show leaderboard for a specific print range')
                .addStringOption(option =>
                    option
                        .setName('range')
                        .setDescription('Print range to show')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Super Print (1-10)', value: 'SP' },
                            { name: 'Low Print (11-99)', value: 'LP' },
                            { name: 'Mid Print (100-499)', value: 'MP' },
                            { name: 'High Print (500-1000)', value: 'HP' },
                            // { name: 'All Prints', value: 'ALL' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('total')
                .setDescription('Show total claims leaderboard')
        ),

    async execute(interaction, { database }) {
        await interaction.deferReply();

        try {
            const guildId = interaction.guild.id;
            const subcommand = interaction.options.getSubcommand();

            // Get all users in the server from database
            const allUsers = await database.users.find({ serverID: guildId }).toArray();
            if (!allUsers || allUsers.length === 0) {
                return await interaction.editReply('No user data found for this server.');
            }

            let leaderboardData = [];
            let title = '';
            let description = '';

            if (subcommand === 'tier') {
                const tier = interaction.options.getString('tier');
                title = `${getTierEmoji(tier)} ${tier} Leaderboard`;
                description = `Top 10 players by ${tier} claims`;

                leaderboardData = allUsers.map(user => ({
                    userId: user.userID,
                    count: user.claims[tier]?.length || 0
                }));
            }
            else if (subcommand === 'print') {
                const range = interaction.options.getString('range');
                if (range === 'ALL') {
                    title = '🖨️ All Prints Leaderboard';
                    description = 'Top 10 players by print ranges';

                    // Calculate counts for all print ranges
                    leaderboardData = allUsers.map(user => {
                        const counts = {
                            SP: 0, LP: 0, MP: 0, HP: 0, total: 0
                        };

                        // Count prints across all tiers
                        Object.values(user.claims).forEach(tierClaims => {
                            tierClaims.forEach(claim => {
                                const print = claim.print;
                                if (print >= 1 && print <= 10) counts.SP++;
                                else if (print >= 11 && print <= 99) counts.LP++;
                                else if (print >= 100 && print <= 499) counts.MP++;
                                else if (print >= 500 && print <= 1000) counts.HP++;
                                counts.total++;
                            });
                        });

                        return {
                            userId: user.userID,
                            ...counts
                        };
                    });

                    // Sort by total claims
                    leaderboardData.sort((a, b) => b.total - a.total);
                } else {
                    const rangeEmoji = {
                        SP: '⭐', LP: '🌟', MP: '💫', HP: '✨'
                    };
                    title = `${rangeEmoji[range]} ${range} Leaderboard`;
                    description = `Top 10 players by ${range} (${getRangeDescription(range)})`;

                    // Calculate counts for specific print range
                    leaderboardData = allUsers.map(user => {
                        let count = 0;
                        Object.values(user.claims).forEach(tierClaims => {
                            tierClaims.forEach(claim => {
                                const print = claim.print;
                                if (isInPrintRange(print, range)) count++;
                            });
                        });
                        return { userId: user.userID, count };
                    });
                }
            }
            else { // total
                title = '🏆 Total Claims Leaderboard';
                description = 'Top 10 players by total claims';

                leaderboardData = allUsers.map(user => {
                    let total = 0;
                    Object.values(user.claims).forEach(tierClaims => {
                        total += tierClaims.length;
                    });
                    return { userId: user.userID, count: total };
                });
            }

            // Sort data (if not already sorted)
            if (subcommand !== 'print' || interaction.options.getString('range') !== 'ALL') {
                leaderboardData.sort((a, b) => b.count - a.count);
            }

            // Create embed
            const embed = new EmbedBuilder()
                .setColor('#FFC0CB')
                .setTitle(title)
                .setDescription(description);

            // Add top 10 fields
            const top10 = leaderboardData.slice(0, 10);
            let leaderboardText = '';

            if (subcommand === 'print' && interaction.options.getString('range') === 'ALL') {
                leaderboardText = top10.map((data, index) => {
                    return `${index + 1}. <@${data.userId}>` +
                           `⭐${data.SP}|🌟${data.LP}|💫${data.MP}|✨${data.HP}` +
                           `Total: ${data.total}\n`;
                }).join('\n');
            } else {
                leaderboardText = top10.map((data, index) => 
                    `${index + 1}. <@${data.userId}> - ${data.count} claims`
                ).join('\n');
            }
            leaderboardText += `⭐**SP** = v**1**-v**10**\n🌟**LP** = v**11**-v**99**\n💫**MP** = v**101**-v**499**\n✨**HP** = v**500**-v**1000**\n`;

            embed.addFields({ name: 'Rankings', value: leaderboardText || 'No data available' });

            // Add user's rank if they exist in the data
            const userId = interaction.user.id;
            const userRank = leaderboardData.findIndex(data => data.userId === userId) + 1;
            const userData = leaderboardData.find(data => data.userId === userId);

            if (userRank > 0 && userData) {  // Only add user stats if they exist in the data
                let userStats;
                if (subcommand === 'print' && interaction.options.getString('range') === 'ALL') {
                    userStats = `**Your Stats:**\n` +
                               `⭐**${userData.SP}** |🌟**${userData.LP}** |💫**${userData.MP}** |✨**${userData.HP}**\n` +
                               `Total: ${userData.total} | Rank: #${userRank}/${leaderboardData.length}`;
                } else {
                    userStats = `Your Claims: **${userData.count}** | Your Rank: #**${userRank}**/**${leaderboardData.length}**`;
                }
                embed.addFields({ name: 'Your Statistics', value: userStats });
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in leaderboard command:', error);
            await interaction.editReply('An error occurred while fetching the leaderboard.');
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

function isInPrintRange(print, range) {
    switch (range) {
        case 'SP': return print >= 1 && print <= 10;
        case 'LP': return print >= 11 && print <= 99;
        case 'MP': return print >= 100 && print <= 499;
        case 'HP': return print >= 500 && print <= 1000;
        default: return false;
    }
}
