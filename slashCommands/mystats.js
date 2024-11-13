const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const getTierEmoji = require('../utility/getTierEmoji');
const getLoadBar = require('../utility/getLoadBar');
const { enrichClaimWithCardData } = require('../utility/cardAPI');

// Create a cooldown collection
const cooldowns = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mystats')
        .setDescription('Shows server or user stats')
        .addStringOption(option =>
            option
                .setName('category')
                .setDescription('Stats category to view')
                .setRequired(true)
                .addChoices(
                    { name: 'Overview', value: 'overview' },
                    { name: 'Best Card', value: 'best' },
                    { name: 'Print Distribution', value: 'prints' },
                    { name: 'Tier Distribution', value: 'tiers' },
                    { name: 'Tier Claim Times', value: 'tier_times' },
                    { name: 'Print Claim Times', value: 'print_times' }
                )
        )
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User to check stats for')
                .setRequired(false)
        ),
          
    async execute(interaction, { database }) {
        try {
            // Defer reply immediately to prevent timeout
            await interaction.deferReply();

            // Check cooldown
            const userId = interaction.user.id;
            const guildId = interaction.guild.id;
            const cooldownKey = `${userId}-${guildId}`;
            const cooldownAmount = 5000; // 5 seconds in milliseconds

            if (cooldowns.has(cooldownKey)) {
                const expirationTime = cooldowns.get(cooldownKey);
                const now = Date.now();
                
                if (now < expirationTime) {
                    const timeLeft = (expirationTime - now) / 1000;
                    return await interaction.editReply({
                        content: `Please wait ${timeLeft.toFixed(1)} more seconds before using this command again.`,
                        ephemeral: true
                    });
                }
            }

            const targetUser = interaction.options.getUser('user') || interaction.user;
            const category = interaction.options.getString('category');

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
                CT: userData.counts[0] || 0,
                RT: userData.counts[1] || 0,
                SRT: userData.counts[2] || 0,
                SSRT: userData.counts[3] || 0
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

            // Function to compare card quality
            const isHigherQuality = (card1, card2) => {
                const tierRank = { 'SSRT': 4, 'SRT': 3, 'RT': 2, 'CT': 1 };
                const printRank = { 'SP': 2, 'LP': 1, 'OTHER': 0 };
                
                const tier1Rank = tierRank[card1.tier] || 0;
                const tier2Rank = tierRank[card2.tier] || 0;
                const print1Rank = printRank[getPrintQuality(card1.print)];
                const print2Rank = printRank[getPrintQuality(card2.print)];

                const combo1Score = (tier1Rank * 10) + print1Rank;
                const combo2Score = (tier2Rank * 10) + print2Rank;
                
                return combo1Score > combo2Score;
            };

            // Find best quality card
            let bestCard = null;

            // Process claims
            for (const tier in userData.claims) {
                for (const claim of userData.claims[tier] || []) {
                    const printNum = claim.print;
                    
                    if (claim.timestamp) {
                        const timestamp = new Date(claim.timestamp);
                        claimTimesByTier[tier].push(timestamp);
                        
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

                    if (!bestCard || isHigherQuality({ ...claim, tier }, { ...bestCard, tier: bestCard.tier })) {
                        bestCard = { ...claim, tier };
                    }
                }
            }

            const totalClaims = Object.values(tierCounts).reduce((a, b) => a + b, 0);
            const totalPrints = Object.values(printRangeCounts).reduce((a, b) => a + b, 0);

            const calculateAverageTimeBetweenClaims = (times) => {
                if (!times || times.length < 2) return null;
                
                const timestamps = times.map(time => Math.floor(time.getTime() / 1000));
                timestamps.sort((a, b) => a - b);
                
                let totalDiff = 0;
                let diffCount = 0;
                
                for (let i = 1; i < timestamps.length; i++) {
                    const diff = timestamps[i] - timestamps[i-1];
                    if (!isNaN(diff)) {
                        totalDiff += diff;
                        diffCount++;
                    }
                }
                
                if (diffCount === 0) return null;
                
                const avgSeconds = Math.floor(totalDiff / diffCount);
                
                const hours = Math.floor(avgSeconds / 3600);
                const minutes = Math.floor((avgSeconds % 3600) / 60);
                const seconds = avgSeconds % 60;
                
                let result = '';
                if (hours > 0) result += `**${String(hours).padStart(2, '0')}**h`;
                if (minutes > 0) result += `**${String(minutes).padStart(2, '0')}**m`;
                result += `**${String(seconds).padStart(2, '0')}**s`;
                
                return result;
            };

            // Create base embed template
            const createBaseEmbed = () => {
                return new EmbedBuilder()
                    .setColor('#FFC0CB')
                    .setAuthor({
                        name: `${targetUser.username}'s Stats`, 
                        iconURL: targetUser.displayAvatarURL(),
                        url: `https://mazoku.cc/user/${targetUser.id}`
                    })
                    .setThumbnail(targetUser.displayAvatarURL())
                    .setFooter({ text: 'Mazoku stats Auto-Summon' });
            };

            let embed;

            switch (category) {
                case 'overview':
                    embed = createBaseEmbed()
                        .setTitle('Overview')
                        .addFields({ 
                            name: 'Total Claims', 
                            value: totalClaims.toString(), 
                            inline: true 
                        });
                    break;

                case 'best':
                    embed = createBaseEmbed().setTitle('Best Claimed Card');
                    if (bestCard) {
                        const enrichedCard = await enrichClaimWithCardData(bestCard);
                        if (enrichedCard) {
                            const makers = enrichedCard.card.makers.map(id => `<@${id}>`).join(', ');
                            embed.addFields({
                                name: 'Card Details',
                                value: `*${enrichedCard.card.series}*\n` +
                                       `${getTierEmoji(bestCard.tier)} **${enrichedCard.cardName}** #**${enrichedCard.print}** \n` +
                                       `**Maker(s)**: ${makers}\n` +
                                       `**Owner**: ${enrichedCard.owner}\n` +
                                       `**Claimed**: <t:${isoToUnixTimestamp(enrichedCard.timestamp)}:R>`
                            })
                            .setThumbnail(`https://cdn.mazoku.cc/packs/${bestCard.cardID}`);
                        }
                    } else {
                        embed.addFields({
                            name: 'No Cards',
                            value: 'No cards claimed yet'
                        });
                    }
                    break;

                case 'prints':
                    embed = createBaseEmbed()
                        .setTitle('Print Distribution')
                        .addFields({
                            name: 'Distribution',
                            value: Object.entries(printRangeCounts)
                                .map(([range, count]) => {
                                    const percentage = totalPrints > 0 ? (count / totalPrints) * 100 : 0;
                                    return `**${range}** (${getRangeDescription(range)}): **${count}** *${percentage.toFixed(0)}%*`;
                                })
                                .join('\n')
                        });
                    break;

                case 'tiers':
                    embed = createBaseEmbed()
                        .setTitle('Tier Distribution')
                        .addFields({
                            name: 'Distribution',
                            value: Object.entries(tierCounts)
                                .map(([tier, count]) => {
                                    const percentage = totalClaims > 0 ? (count / totalClaims) * 100 : 0;
                                    return `${getTierEmoji(tier)} **${count}** *${percentage.toFixed(0)}%* `;
                                })
                                .join('\n')
                        });
                    break;

                case 'tier_times':
                    embed = createBaseEmbed()
                        .setTitle('Average Time Between Claims by Tier')
                        .addFields({
                            name: 'Claim Times',
                            value: Object.entries(claimTimesByTier)
                                .filter(([_, times]) => times.length > 0)
                                .map(([tier, times]) => {
                                    const avgTime = calculateAverageTimeBetweenClaims(times);
                                    return `${getTierEmoji(tier)}: ${avgTime || 'N/A'}`;
                                })
                                .join('\n') || 'No claim time data available'
                        });
                    break;

                case 'print_times':
                    embed = createBaseEmbed()
                        .setTitle('Average Print Claim Times')
                        .addFields({
                            name: 'Claim Times',
                            value: Object.entries(claimTimesByPrintRange)
                                .filter(([_, times]) => times.length > 0)
                                .map(([range, times]) => {
                                    const avgTime = calculateAverageTimeBetweenClaims(times);
                                    return `**${range}** (${getRangeDescription(range)}): ${avgTime || 'N/A'}`;
                                })
                                .join('\n') || 'No claim time data available'
                        });
                    break;
            }

            await interaction.editReply({ embeds: [embed] });

            // Set cooldown
            cooldowns.set(cooldownKey, Date.now() + cooldownAmount);

            // Clean up expired cooldowns
            setTimeout(() => cooldowns.delete(cooldownKey), cooldownAmount);

        } catch (error) {
            console.error('Error in stats command:', error);
            // Only try to edit reply if we haven't already sent an error response
            try {
                await interaction.editReply({
                    content: 'An error occurred while fetching stats.',
                    ephemeral: true
                });
            } catch (e) {
                // If editing fails, try to send a new reply
                try {
                    await interaction.reply({
                        content: 'An error occurred while fetching stats.',
                        ephemeral: true
                    });
                } catch (finalError) {
                    console.error('Failed to send error message:', finalError);
                }
            }
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

function isoToUnixTimestamp(isoTimestamp) {
    return Math.floor(Date.parse(isoTimestamp) / 1000);
}
