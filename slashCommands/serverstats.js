const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const getTierEmoji = require('../utility/getTierEmoji');
const getLoadBar = require('../utility/getLoadBar');
const { enrichClaimWithCardData } = require('../utility/cardAPI');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('serverstats')
        .setDescription('Shows server-wide card statistics'),
    async execute(interaction, { database }) {
        try {
            await interaction.deferReply();
            const guildId = interaction.guild.id;

            // Get all server claims
            const mServerDB = await database.getServerData(guildId);
            if (!mServerDB || !mServerDB.claims) {
                return await interaction.editReply({
                    content: 'No claims data found for this server.',
                    ephemeral: true
                });
            }

            // Track best print overall and unique owners
            let bestPrint = null;
            const uniqueOwners = new Set();
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

            // Function to compare tiers
            const isBetterTier = (tier1, tier2) => {
                const tiers = ['CT', 'RT', 'SRT', 'SSRT'];
                return tiers.indexOf(tier1) > tiers.indexOf(tier2);
            };

            // Function to compare print ranges
            const isBetterPrint = (print1, print2) => {
                if (print1 >= 1 && print1 <= 10) return true; // SP is best
                if (print2 >= 1 && print2 <= 10) return false;
                if (print1 >= 11 && print1 <= 99) return true; // LP is next best
                if (print2 >= 11 && print2 <= 99) return false;
                if (print1 >= 100 && print1 <= 499) return true; // MP is next
                if (print2 >= 100 && print2 <= 499) return false;
                return true; // HP is last
            };

            for (const tier in mServerDB.claims) {
                for (const claim of mServerDB.claims[tier] || []) {
                    uniqueOwners.add(claim.owner);
                    
                    // Track times by tier
                    claimTimesByTier[tier].push(claim.timestamp);
                    
                    // Track times by print range
                    const printNum = claim.print;
                    if (printNum >= 1 && printNum <= 10) claimTimesByPrintRange.SP.push(claim.timestamp);
                    else if (printNum >= 11 && printNum <= 99) claimTimesByPrintRange.LP.push(claim.timestamp);
                    else if (printNum >= 100 && printNum <= 499) claimTimesByPrintRange.MP.push(claim.timestamp);
                    else if (printNum >= 500 && printNum <= 1000) claimTimesByPrintRange.HP.push(claim.timestamp);
                    
                    // Update best print based on tier and print number
                    if (!bestPrint || isBetterTier(tier, bestPrint.tier) || 
                        (tier === bestPrint.tier && isBetterPrint(claim.print, bestPrint.print))) {
                        bestPrint = { ...claim, tier };
                    }
                }
            }

            // Calculate tier counts
            const tierCounts = {
                CT: mServerDB.claims.CT?.length || 0,
                RT: mServerDB.claims.RT?.length || 0,
                SRT: mServerDB.claims.SRT?.length || 0,
                SSRT: mServerDB.claims.SSRT?.length || 0
            };

            // Calculate print range counts
            const printRangeCounts = {
                SP: 0,
                LP: 0,
                MP: 0,
                HP: 0
            };

            // Count cards in each print range
            for (const tier in mServerDB.claims) {
                for (const claim of mServerDB.claims[tier] || []) {
                    const printNum = claim.print;
                    if (printNum >= 1 && printNum <= 10) printRangeCounts.SP++;
                    else if (printNum >= 11 && printNum <= 99) printRangeCounts.LP++;
                    else if (printNum >= 100 && printNum <= 499) printRangeCounts.MP++;
                    else if (printNum >= 500 && printNum <= 1000) printRangeCounts.HP++;
                }
            }

            // Calculate total claims
            const totalClaims = Object.values(tierCounts).reduce((a, b) => a + b, 0);

            const formatTime = (ms) => {
                if (!ms || isNaN(ms)) return '0h 0m 0s';
                const seconds = Math.floor(ms / 1000);
                const minutes = Math.floor(seconds / 60);
                const hours = Math.floor(minutes / 60);
                return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
            };

            const calculateAverageTimeBetweenClaims = (times) => {
                if (!times || times.length < 2) return 0;
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
                return timeDiffCount > 0 ? totalTimeDiff / timeDiffCount : 0;
            };

            // Create stats embed
            const embed = new EmbedBuilder()
                .setColor('#FFC0CB')
                .setTitle(`${interaction.guild.name} Server Stats`);

            // Add total claims and players first
            embed.addFields(
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
                    name: 'Players in Server', 
                    value: uniqueOwners.size.toString(), 
                    inline: true 
                }
            );

            // Add best print showcase
            if (bestPrint) {
                const enrichedCard = await enrichClaimWithCardData(bestPrint);
                if (enrichedCard) {
                    embed.addFields({
                        name: `Best ${bestPrint.tier} Print`,
                        value: `Card: ${enrichedCard.cardName}\n` +
                               `Anime: ${enrichedCard.card.series}\n` +
                               `Print: #${enrichedCard.print}\n` +
                               `Owner: ${interaction.guild.members.cache.get(enrichedCard.owner)?.user.username || enrichedCard.owner}\n` +
                               `Claimed: <t:${Math.floor(enrichedCard.timestamp / 1000)}:R>`
                    });
                    embed.setThumbnail(enrichedCard.card.cardImageLink);
                }
            }

            // Add tier and print distribution inline
            embed.addFields(
                {
                    name: 'Claims by Tier',
                    value: Object.entries(tierCounts)
                        .map(([tier, count]) => {
                            const percentage = totalClaims > 0 ? (count / totalClaims) * 100 : 0;
                            return `${getTierEmoji(tier)} ${count} (${percentage.toFixed(1)}%) ${getLoadBar(percentage)}`;
                        })
                        .join('\n'),
                    inline: true
                },
                {
                    name: 'Print Distribution',
                    value: Object.entries(printRangeCounts)
                        .map(([range, count]) => {
                            const percentage = totalClaims > 0 ? (count / totalClaims) * 100 : 0;
                            return `${range} (${getRangeDescription(range)}): ${count} (${percentage.toFixed(1)}%) ${getLoadBar(percentage)}`;
                        })
                        .join('\n'),
                    inline: true
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

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in serverstats command:', error);
            await interaction.editReply({
                content: 'An error occurred while fetching server stats.',
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
