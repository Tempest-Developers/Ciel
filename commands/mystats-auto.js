const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const getTierEmoji = require('../utility/getTierEmoji');
const getLoadBar = require('../utility/getLoadBar');
const { enrichClaimWithCardData } = require('../utility/cardAPI');
const { handleInteraction, handleCommandError, safeDefer } = require('../utility/interactionHandler');

// Add cooldown system
const cooldowns = new Map();
const COOLDOWN_DURATION = 5000; // 5 seconds in milliseconds

// Function to check if timestamp is within last 30 minutes
const isWithinLast30Minutes = (timestamp) => {
    const thirtyMinutesAgo = Date.now() - (30 * 60 * 1000);
    return new Date(timestamp).getTime() > thirtyMinutesAgo;
};

// Function to handle Mazoku API errors
const handleMazokuAPICall = async (apiCall) => {
    try {
        const response = await apiCall();
        return response;
    } catch (error) {
        console.error('Mazoku API Error:', error);
        if (error.response) {
            const status = error.response.status;
            if (status === 400 || status === 404 || status === 500) {
                throw new Error("The Mazoku Servers are currently unavailable. Please try again later.");
            }
        }
        throw error;
    }
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mystats-auto')
        .setDescription('Shows your auto-claim stats for this server')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Type of stats to show')
                .setRequired(true)
                .addChoices(
                    { name: 'Overview', value: 'overview' },
                    { name: 'Best Drop', value: 'best' },
                    { name: 'Tier Distribution', value: 'tiers' },
                    { name: 'Print Distribution', value: 'prints' },
                    { name: 'Tier Claim Times', value: 'tiertimes' },
                    { name: 'Print Claim Times', value: 'printtimes' }
                )),

    async execute(interaction, { database }) {
        // Add cooldown check
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;
        const cooldownKey = `${userId}-${guildId}`;
        
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

        // Set cooldown
        cooldowns.set(cooldownKey, Date.now() + COOLDOWN_DURATION);
        setTimeout(() => cooldowns.delete(cooldownKey), COOLDOWN_DURATION);

        let hasDeferred = false;
        try {
            await safeDefer(interaction);
            hasDeferred = true;
            
            const statType = interaction.options.getString('type');

            // Get user data
            const userData = await database.getPlayerData(userId, guildId);
            if (!userData) {
                return await handleInteraction(interaction, {
                    content: 'No data found for you in this server.',
                    ephemeral: true
                }, 'editReply');
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
                HP: []  // 500-2000
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

            // Find best quality card and count recent claims
            let bestCard = null;
            let recentClaimsCount = 0;

            // Process claims
            for (const tier in userData.claims) {
                for (const claim of userData.claims[tier] || []) {
                    const printNum = claim.print;
                    
                    if (claim.timestamp) {
                        const timestamp = new Date(claim.timestamp);
                        claimTimesByTier[tier].push(timestamp);
                        
                        if (isWithinLast30Minutes(claim.timestamp)) {
                            recentClaimsCount++;
                            
                            // Only consider claims from last 30 minutes for best card
                            if (!bestCard || isHigherQuality({ ...claim, tier }, { ...bestCard, tier: bestCard.tier })) {
                                bestCard = { ...claim, tier };
                            }
                        }
                        
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
                        else if (printNum >= 500 && printNum <= 2000) {
                            printRangeCounts.HP++;
                            claimTimesByPrintRange.HP.push(timestamp);
                        }
                    }
                }
            }

            const totalClaims = Object.values(tierCounts).reduce((a, b) => a + b, 0);
            const totalPrints = Object.values(printRangeCounts).reduce((a, b) => a + b, 0);

            // Create base embed
            const embed = new EmbedBuilder()
                .setColor('#FFC0CB')
                .setAuthor({
                    name: `${interaction.user.username}'s Auto-Claim Stats`,
                    iconURL: interaction.user.displayAvatarURL(),
                    url: `https://mazoku.cc/user/${interaction.user.id}`
                })
                .setThumbnail(interaction.user.displayAvatarURL())
                .setFooter({ 
                    text: `Mazoku stats Auto-Summon | Player: ${interaction.user.username} | Guild: ${interaction.guild.name}` 
                });

            // Handle different stat types
            switch(statType) {
                case 'overview':
                    embed.addFields({ 
                        name: `Total Claims:  ${totalClaims.toString()}`, 
                        value: `*Claims in last 30 minutes*: ${recentClaimsCount.toString()}`,
                    });
                    break;

                case 'best':
                    if (bestCard) {
                        try {
                            const enrichedCard = await handleMazokuAPICall(async () => {
                                return await enrichClaimWithCardData(bestCard);
                            });
                            
                            if (enrichedCard && enrichedCard.card) {
                                const makers = enrichedCard.card.makers?.map(id => `<@${id}>`).join(', ') || '*Data Unavailable*';
                                const cardName = enrichedCard.cardName || '*Data Unavailable*';
                                const series = enrichedCard.card.series || '*Data Unavailable*';
                                
                                embed.addFields({
                                    name: 'Best Drop (Last 30 Minutes)',
                                    value: `*${series}*\n` +
                                           `${getTierEmoji(bestCard.tier)} **${cardName}** #**${enrichedCard.print}** \n` +
                                           `**Maker(s)**: ${makers}\n` +
                                           `**Owner**: ${enrichedCard.owner}\n` +
                                           `**Claimed**: <t:${isoToUnixTimestamp(enrichedCard.timestamp)}:R>`
                                })
                                .setThumbnail(`https://cdn.mazoku.cc/packs/${bestCard.cardID}`);
                            } else {
                                embed.addFields({
                                    name: 'Best Drop (Last 30 Minutes)',
                                    value: '*No drops in the last 30 minutes*'
                                });
                            }
                        } catch (error) {
                            if (error.message === "The Mazoku Servers are currently unavailable. Please try again later.") {
                                return await interaction.editReply(error.message);
                            }
                            console.error('Error enriching card data:', error);
                            embed.addFields({
                                name: 'Best Drop (Last 30 Minutes)',
                                value: '*Data Unavailable*'
                            });
                        }
                    } else {
                        embed.addFields({
                            name: 'Best Drop (Last 30 Minutes)',
                            value: '*No drops in the last 30 minutes*'
                        });
                    }
                    break;

                case 'tiers':
                    embed.addFields({
                        name: 'Claims by Tier',
                        value: Object.entries(tierCounts)
                            .filter(([_, count]) => count > 0)
                            .map(([tier, count]) => {
                                const percentage = totalClaims > 0 ? (count / totalClaims) * 100 : 0;
                                return `${getTierEmoji(tier)} **${count}** ${getLoadBar(percentage)} *${percentage.toFixed(2)}* **%**`;
                            })
                            .join('\n') || '*No claims data available*'
                    });
                    break;

                case 'prints':
                    embed.addFields({
                        name: 'Print Distribution (Last 30 Minutes)',
                        value: Object.entries(printRangeCounts)
                            .filter(([_, count]) => count > 0)
                            .map(([range, count]) => {
                                const percentage = totalPrints > 0 ? (count / totalPrints) * 100 : 0;
                                return `**${range}** (${getRangeDescription(range)}): **${count}** ${getLoadBar(percentage)} *${percentage.toFixed(2)}* **%**`;
                            })
                            .join('\n') || '*No print data available for the last 30 minutes*'
                    });
                    break;

                case 'tiertimes':
                    embed.addFields({
                        name: 'Average Time Between Claims by Tier',
                        value: Object.entries(claimTimesByTier)
                            .filter(([_, times]) => times.length > 0)
                            .map(([tier, times]) => {
                                const avgTime = calculateAverageTimeBetweenClaims(times);
                                return `${getTierEmoji(tier)}: ${avgTime || '*Data Unavailable*'}`;
                            })
                            .join('\n') || '*No claim data available*'
                    });
                    break;

                case 'printtimes':
                    embed.addFields({
                        name: 'Average Print Claim Time',
                        value: Object.entries(claimTimesByPrintRange)
                            .filter(([_, times]) => times.length > 0)
                            .map(([range, times]) => {
                                const avgTime = calculateAverageTimeBetweenClaims(times);
                                return `**${range}** (${getRangeDescription(range)}): ${avgTime || '*Data Unavailable*'}`;
                            })
                            .join('\n') || '*No print claim data available*'
                    });
                    break;
            }

            return await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in mystats-auto command:', error);
            
            const errorMessage = error.message === "The Mazoku Servers are currently unavailable. Please try again later."
                ? error.message
                : 'An error occurred while fetching auto-claim stats.';
            
            if (!hasDeferred) {
                await handleInteraction(interaction, {
                    content: errorMessage,
                    ephemeral: true
                });
            } else {
                await handleInteraction(interaction, {
                    content: errorMessage,
                    ephemeral: true
                }, 'editReply');
            }
        }
    },
};

// Helper functions remain unchanged
function getRangeDescription(range) {
    switch (range) {
        case 'SP': return '1-10';
        case 'LP': return '11-99';
        case 'MP': return '100-499';
        case 'HP': return '500-2000';
        default: return '';
    }
}

function isoToUnixTimestamp(isoTimestamp) {
    return Math.floor(Date.parse(isoTimestamp) / 1000);
}

function calculateAverageTimeBetweenClaims(times) {
    if (!times || times.length < 2) return null;
    
    const timestamps = times.map(time => Math.floor(time.getTime() / 1000));
    timestamps.sort((a, b) => a - b);
    
    // Add current time as the last timestamp to account for time since last claim
    const currentTimestamp = Math.floor(Date.now() / 1000);
    timestamps.push(currentTimestamp);
    
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
}

function isHigherQuality(card1, card2) {
    const printRank = { 'SP': 4, 'LP': 3, 'MP': 2, 'HP': 1, 'OTHER': 0 };
    const tierRank = { 'SSRT': 4, 'SRT': 3, 'RT': 2, 'CT': 1 };
    
    const print1Quality = getPrintQuality(card1.print);
    const print2Quality = getPrintQuality(card2.print);
    
    const print1Rank = printRank[print1Quality];
    const print2Rank = printRank[print2Quality];
    
    if (print1Rank !== print2Rank) {
        return print1Rank > print2Rank;
    }
    
    const tier1Rank = tierRank[card1.tier] || 0;
    const tier2Rank = tierRank[card2.tier] || 0;
    
    if (tier1Rank !== tier2Rank) {
        return tier1Rank > tier2Rank;
    }
    
    // If both print rank and tier rank are equal, prefer lower print number
    return card1.print < card2.print;
}

function getPrintQuality(print) {
    if (print >= 1 && print <= 10) return 'SP';
    if (print >= 11 && print <= 99) return 'LP';
    if (print >= 100 && print <= 499) return 'MP';
    if (print >= 500 && print <= 2000) return 'HP';
    return 'OTHER';
}
