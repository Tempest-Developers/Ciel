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
                SP: 0, // 1-10
                LP: 0, // 11-99
                MP: 0, // 100-499
                HP: 0  // 500-1000
            };

            // Find lowest print SP/LP card for showcase
            let lowestPrintCard = null;
            let lowestPrintNum = Infinity;

            // Count cards in each print range, find lowest print, and track claim times
            for (const tier in userData.claims) {
                for (const claim of userData.claims[tier] || []) {
                    const printNum = claim.print;
                    
                    // Track claim times by tier
                    claimTimesByTier[tier].push(claim.timestamp);
                    
                    // Track claim times by print range and count prints
                    if (printNum >= 1 && printNum <= 10) {
                        printRangeCounts.SP++;
                        claimTimesByPrintRange.SP.push(claim.timestamp);
                    }
                    else if (printNum >= 11 && printNum <= 99) {
                        printRangeCounts.LP++;
                        claimTimesByPrintRange.LP.push(claim.timestamp);
                    }
                    else if (printNum >= 100 && printNum <= 499) {
                        printRangeCounts.MP++;
                        claimTimesByPrintRange.MP.push(claim.timestamp);
                    }
                    else if (printNum >= 500 && printNum <= 1000) {
                        printRangeCounts.HP++;
                        claimTimesByPrintRange.HP.push(claim.timestamp);
                    }

                    // Track lowest print SP/LP card
                    if (printNum <= 99 && printNum < lowestPrintNum) {
                        lowestPrintCard = claim;
                        lowestPrintNum = printNum;
                    }
                }
            }

            // Calculate total claims
            const totalClaims = Object.values(tierCounts).reduce((a, b) => a + b, 0);
            const totalPrints = Object.values(printRangeCounts).reduce((a, b) => a + b, 0);

            const formatTime = (ms) => {
                const seconds = Math.floor(ms / 1000);
                const minutes = Math.floor(seconds / 60);
                const hours = Math.floor(minutes / 60);
                return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
            };

            const calculateAverageTimeBetweenClaims = (times) => {
                if (times.length < 2) return 0;
                times.sort((a, b) => a - b);
                let totalTimeDiff = 0;
                let timeDiffCount = 0;
                for (let i = 1; i < times.length; i++) {
                    totalTimeDiff += times[i] - times[i-1];
                    timeDiffCount++;
                }
                return timeDiffCount > 0 ? totalTimeDiff / timeDiffCount : 0;
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

            // Add average claim times by tier
            embed.addFields({
                name: 'Average Time Between Claims by Tier',
                value: Object.entries(claimTimesByTier)
                    .filter(([_, times]) => times.length > 0)
                    .map(([tier, times]) => {
                        const avgTime = calculateAverageTimeBetweenClaims(times);
                        return `${getTierEmoji(tier)}: ${formatTime(avgTime)}`;
                    })
                    .join('\n'),
                inline: false
            });

            // Add average claim times by print range
            embed.addFields({
                name: 'Average Time Between Claims by Print Range',
                value: Object.entries(claimTimesByPrintRange)
                    .filter(([_, times]) => times.length > 0)
                    .map(([range, times]) => {
                        const avgTime = calculateAverageTimeBetweenClaims(times);
                        return `${range} (${getRangeDescription(range)}): ${formatTime(avgTime)}`;
                    })
                    .join('\n'),
                inline: false
            });

            // Add best card showcase if we found a low print card
            if (lowestPrintCard) {
                // Enrich the card data with API information
                const enrichedCard = await enrichClaimWithCardData(lowestPrintCard);
                const makers = enrichedCard.card.makers.map(id => `<@${id}>`).join(', ');
                embed.addFields({
                    name: 'Best Print Showcase',
                    value: `Card: ${enrichedCard.cardName}\n` +
                           `Anime: ${enrichedCard.card.series}\n` +
                           `Type: ${enrichedCard.card.type}\n` +
                           `Print: #${enrichedCard.print}\n` +
                           `Maker(s): ${makers}\n` +
                           `Owner: <@${enrichedCard.owner}>`
                });
                embed.setImage(enrichedCard.card.cardImageLink);
            }

            embed.setFooter({ 
                text: `Stats as of ${new Date().toLocaleString()}` 
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
