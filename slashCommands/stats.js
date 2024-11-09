const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const getTierEmoji = require('../utility/getTierEmoji');
const getLoadBar = require('../utility/getLoadBar');
const { enrichClaimWithCardData } = require('../utility/cardAPI');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('Shows server or user stats')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User to check stats for')
                .setRequired(false)
        ),
    async execute(interaction, { database }) {
        try {
            await interaction.deferReply();

            const targetUser = interaction.options.getUser('user') || interaction.user;
            const guildId = interaction.guild.id;

            // Get server settings to check if stats are allowed
            const serverSettings = await database.getServerSettings(guildId);
            if (!serverSettings?.settings?.allowShowStats) {
                return await interaction.editReply({
                    content: 'Stats are currently disabled in this server.',
                    ephemeral: true
                });
            }

            // Get user data
            const userData = await database.getPlayerData(targetUser.id, guildId);
            if (!userData) {
                return await interaction.editReply({
                    content: 'No data found for this user.',
                    ephemeral: true
                });
            }

            // Track claim times by tier and print range
            const claimTimesByTier = {
                CT: [],
                RT: [],
                SRT: [],
                SSRT: []
            };
            const claimTimesByPrintRange = {
                SP: [], // 1-10
                LP: [], // 11-99
                MP: [], // 100-499
                HP: []  // 500-1000
            };

            // Calculate tier counts
            const tierCounts = {
                CT: userData.claims.CT?.length || 0,
                RT: userData.claims.RT?.length || 0,
                SRT: userData.claims.SRT?.length || 0,
                SSRT: userData.claims.SSRT?.length || 0
            };

            // Calculate print range counts
            const printRangeCounts = {
                SP: 0,
                LP: 0,
                MP: 0,
                HP: 0
            };

            // Function to get print quality
            const getPrintQuality = (print) => {
                if (print >= 1 && print <= 10) return 'SP';
                if (print >= 11 && print <= 99) return 'LP';
                return 'OTHER';
            };

            // Function to compare card quality based on tier and print
            const isHigherQuality = (card1, card2) => {
                const tierRank = { 'SSRT': 4, 'SRT': 3, 'RT': 2, 'CT': 1 };
                const printRank = { 'SP': 2, 'LP': 1, 'OTHER': 0 };
                
                const tier1Rank = tierRank[card1.tier] || 0;
                const tier2Rank = tierRank[card2.tier] || 0;
                const print1Rank = printRank[getPrintQuality(card1.print)];
                const print2Rank = printRank[getPrintQuality(card2.print)];

                // First compare tier+print combination
                const combo1Score = (tier1Rank * 10) + print1Rank;
                const combo2Score = (tier2Rank * 10) + print2Rank;
                
                return combo1Score > combo2Score;
            };

            // Find best quality card for showcase
            let bestCard = null;

            // Process claims
            for (const tier in userData.claims) {
                for (const claim of userData.claims[tier] || []) {
                    const printNum = claim.print;
                    
                    // Track claim times by tier with proper date handling
                    if (claim.timestamp) {
                        const timestamp = new Date(claim.timestamp);
                        claimTimesByTier[tier].push(timestamp);
                        
                        // Track claim times by print range
                        if (printNum >= 1 && printNum <= 10) {
                            printRangeCounts.SP++;
                            claimTimesByPrintRange.SP.push(timestamp);
                        }
                        else if (printNum >= 11 && printNum <= 99) {
                            printRangeCounts.LP++;
                            claimTimesByPrintRange.LP.push(timestamp);
                        }
                        else if (printNum >= 100 && printNum <= 499) {
                            printRangeCounts.MP++;
                            claimTimesByPrintRange.MP.push(timestamp);
                        }
                        else if (printNum >= 500 && printNum <= 1000) {
                            printRangeCounts.HP++;
                            claimTimesByPrintRange.HP.push(timestamp);
                        }
                    }

                    // Update best card based on quality comparison
                    if (!bestCard || isHigherQuality({ ...claim, tier }, { ...bestCard, tier: bestCard.tier })) {
                        bestCard = { ...claim, tier };
                    }
                }
            }

            // Calculate total claims
            const totalClaims = Object.values(tierCounts).reduce((a, b) => a + b, 0);
            const totalPrints = Object.values(printRangeCounts).reduce((a, b) => a + b, 0);

            const calculateAverageTimeBetweenClaims = (times) => {
                if (!times || times.length < 2) return null;
                times.sort((a, b) => a - b);
                let totalTimeDiff = 0;
                let timeDiffCount = 0;
                for (let i = 1; i < times.length; i++) {
                    const diff = times[i] - times[i-1];
                    if (!isNaN(diff)) {
                        totalTimeDiff += diff;
                        timeDiffCount++;
                    }
                }
                return timeDiffCount > 0 ? new Date(totalTimeDiff / timeDiffCount) : null;
            };

            // Create stats embed
            const embed = new EmbedBuilder()
                .setColor('#FFC0CB')
                .setTitle(`${targetUser.username}'s Stats`)
                .setThumbnail(targetUser.displayAvatarURL())
                .addFields(
                    { 
                        name: 'Total Claims', 
                        value: totalClaims.toString(), 
                        inline: true 
                    },
                    { 
                        name: '\u200B', 
                        value: '\u200B', 
                        inline: true 
                    },
                    { 
                        name: 'Server', 
                        value: interaction.guild.name, 
                        inline: true 
                    }
                )
                .addFields(
                    {
                        name: 'Claims by Tier',
                        value: Object.entries(tierCounts)
                            .map(([tier, count]) => {
                                const percentage = totalClaims > 0 ? (count / totalClaims) * 100 : 0;
                                return `${getTierEmoji(tier)} ${count} (${percentage.toFixed(1)}%) ${getLoadBar(percentage)}`;
                            })
                            .join('\n')
                    }
                )
                .addFields(
                    {
                        name: 'Print Distribution',
                        value: Object.entries(printRangeCounts)
                            .map(([range, count]) => {
                                const percentage = totalPrints > 0 ? (count / totalPrints) * 100 : 0;
                                return `${range} (${getRangeDescription(range)}): ${count} (${percentage.toFixed(1)}%) ${getLoadBar(percentage)}`;
                            })
                            .join('\n')
                    }
                );

            // Add average claim times by tier with ISO format
            embed.addFields({
                name: 'Average Time Between Claims by Tier',
                value: Object.entries(claimTimesByTier)
                    .filter(([_, times]) => times.length > 0)
                    .map(([tier, times]) => {
                        const avgTime = calculateAverageTimeBetweenClaims(times);
                        return `${getTierEmoji(tier)}: ${avgTime ? avgTime.toISOString() : 'N/A'}`;
                    })
                    .join('\n') || 'No claim time data available',
                inline: false
            });

            // Add average claim times by print range with ISO format
            embed.addFields({
                name: 'Average Time Between Claims by Print Range',
                value: Object.entries(claimTimesByPrintRange)
                    .filter(([_, times]) => times.length > 0)
                    .map(([range, times]) => {
                        const avgTime = calculateAverageTimeBetweenClaims(times);
                        return `${range} (${getRangeDescription(range)}): ${avgTime ? avgTime.toISOString() : 'N/A'}`;
                    })
                    .join('\n') || 'No claim time data available',
                inline: false
            });

            // Add best card showcase
            if (bestCard) {
                const enrichedCard = await enrichClaimWithCardData(bestCard);
                if (enrichedCard) {
                    const makers = enrichedCard.card.makers.map(id => `<@${id}>`).join(', ');
                    embed.addFields({
                        name: 'Best Card Showcase',
                        value: `Card: ${enrichedCard.cardName}\n` +
                               `Anime: ${enrichedCard.card.series}\n` +
                               `Type: ${enrichedCard.card.type}\n` +
                               `Print: #${enrichedCard.print} (${getPrintQuality(enrichedCard.print)})\n` +
                               `Maker(s): ${makers}\n` +
                               `Owner: <@${enrichedCard.owner}>\n` +
                               `Claimed: ${new Date(enrichedCard.timestamp).toISOString()}`
                    });
                    // Use the new card image API
                    embed.setImage('https://cdn.mazoku.cc/packs/b2cf1dde-5bc2-4daa-b24b-b2b549a6e3e8');
                }
            }

            embed.setFooter({ 
                text: `Stats as of ${new Date().toISOString()}` 
            });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in stats command:', error);
            await interaction.editReply({
                content: 'An error occurred while fetching stats.',
                ephemeral: true
            });
        }
    },
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
