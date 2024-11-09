const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const getTierEmoji = require('../utility/getTierEmoji');
const getLoadBar = require('../utility/getLoadBar');

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

            // Calculate tier counts
            const tierCounts = {
                CT: mServerDB.claims.CT?.length || 0,
                RT: mServerDB.claims.RT?.length || 0,
                SRT: mServerDB.claims.SRT?.length || 0,
                SSRT: mServerDB.claims.SSRT?.length || 0
            };

            // Calculate print range counts
            const printRangeCounts = {
                SP: 0, // 1-10
                LP: 0, // 11-99
                MP: 0, // 100-499
                HP: 0  // 500-1000
            };

            // Count cards in each print range
            for (const tier in mServerDB.claims) {
                for (const claim of mServerDB.claims[tier] || []) {
                    const printNum = claim.version;
                    if (printNum >= 1 && printNum <= 10) printRangeCounts.SP++;
                    else if (printNum >= 11 && printNum <= 99) printRangeCounts.LP++;
                    else if (printNum >= 100 && printNum <= 499) printRangeCounts.MP++;
                    else if (printNum >= 500 && printNum <= 1000) printRangeCounts.HP++;
                }
            }

            // Calculate total claims
            const totalClaims = Object.values(tierCounts).reduce((a, b) => a + b, 0);
            const totalPrints = Object.values(printRangeCounts).reduce((a, b) => a + b, 0);

            // Find lowest print SP/LP card for thumbnail
            let lowestPrintCard = null;
            let lowestPrintNum = Infinity;

            for (const tier in mServerDB.claims) {
                for (const claim of mServerDB.claims[tier] || []) {
                    if (claim.version <= 99 && claim.version < lowestPrintNum) {
                        lowestPrintCard = claim;
                        lowestPrintNum = claim.version;
                    }
                }
            }

            // Create stats embed
            const embed = new EmbedBuilder()
                .setColor('#FFC0CB')
                .setTitle(`${interaction.guild.name} Server Stats`)
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
                        name: 'Total Prints Tracked', 
                        value: totalPrints.toString(), 
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
                )
                .setFooter({ 
                    text: `Stats as of ${new Date().toLocaleString()}` 
                });

            // Add thumbnail and card details if we found a low print card
            if (lowestPrintCard) {
                embed.setThumbnail(lowestPrintCard.card.cardImageLink);
                const makers = lowestPrintCard.card.makers.map(id => `<@${id}>`).join(', ');
                embed.addFields({
                    name: 'Lowest Print Showcase',
                    value: `Card: ${lowestPrintCard.card.name}\n` +
                           `Anime: ${lowestPrintCard.card.series}\n` +
                           `Print: #${lowestPrintCard.version}\n` +
                           `Maker(s): ${makers}\n` +
                           `Owner: <@${lowestPrintCard.owner}>`
                });
            }

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
