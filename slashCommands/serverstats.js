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

            // Track best prints per tier and unique owners
            const bestPrintsByTier = {};
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
                    
                    if (claim.print <= 99) {
                        if (!bestPrintsByTier[tier] || claim.print < bestPrintsByTier[tier].print) {
                            bestPrintsByTier[tier] = claim;
                        }
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
                .setTitle(`${interaction.guild.name} Server Stats`);

            // Add best prints showcase for each tier
            for (const [tier, claim] of Object.entries(bestPrintsByTier)) {
                const enrichedCard = await enrichClaimWithCardData(claim);
                if (enrichedCard) {
                    embed.addFields({
                        name: `Best ${tier} Print`,
                        value: `Card: ${enrichedCard.cardName}\n` +
                               `Anime: ${enrichedCard.card.series}\n` +
                               `Print: #${enrichedCard.print}\n` +
                               `Owner: ${interaction.guild.members.cache.get(enrichedCard.owner)?.user.username || enrichedCard.owner}\n` +
                               `Claimed: <t:${Math.floor(enrichedCard.timestamp / 1000)}:R>`
                    });
                    if (!embed.data.thumbnail) {
                        embed.setThumbnail(enrichedCard.card.cardImageLink);
                    }
                }
            }

            // Add main stats
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
