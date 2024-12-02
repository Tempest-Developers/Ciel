const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const getTierEmoji = require('../utility/getTierEmoji');
const getLoadBar = require('../utility/getLoadBar');
const { enrichClaimWithCardData } = require('../utility/cardAPI');
const { handleInteraction, handleCommandError, safeDefer } = require('../utility/interactionHandler');

// Add cooldown system
const cooldowns = new Map();
const COOLDOWN_DURATION = 5000; // 5 seconds in milliseconds

// Function to check if timestamp is within last 1 hour
const isWithinLastHour = (timestamp) => {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    return new Date(timestamp).getTime() > oneHourAgo;
};

// Function to check if timestamp is within last 1 week
const isWithinLastWeek = (timestamp) => {
    const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    return new Date(timestamp).getTime() > oneWeekAgo;
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
        .setName('server')
        .setDescription('Shows server-wide card statistics')
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
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const cooldownKey = `${guildId}-${userId}`;

        let hasDeferred = false;
        try {
            
            await safeDefer(interaction);
            hasDeferred = true;
            
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

            const statType = interaction.options.getString('type');

            // Get all server claims
            const mServerDB = await database.getServerData(guildId);
            if (!mServerDB || !mServerDB.claims) {
                return await handleInteraction(interaction, {
                    content: 'No claims data found for this server.',
                    ephemeral: true
                });
            }

            // Track best print overall and unique owners
            let bestPrint = null;
            const uniqueOwners = new Set();
            const recentUniqueOwners = new Set();
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
            const lastClaimedByTier = {
                CT: null,
                RT: null,
                SRT: null,
                SSRT: null
            };

            // Function to get print quality
            const getPrintQuality = (print) => {
                if (print >= 1 && print <= 10) return 'SP';
                if (print >= 11 && print <= 99) return 'LP';
                if (print >= 100 && print <= 499) return 'MP';
                if (print >= 500 && print <= 2000) return 'HP';
                return 'OTHER';
            };

            // Function to compare card quality (prioritizing print rank over tier rank)
            const isHigherQuality = (card1, card2) => {
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
            };

            // Calculate tier counts
            const tierCounts = {
                CT: mServerDB.counts[0] || 0,
                RT: mServerDB.counts[1] || 0,
                SRT: mServerDB.counts[2] || 0,
                SSRT: (mServerDB.counts[3] || 0) + (mServerDB.counts[4] || 0) + (mServerDB.counts[5] || 0),
            };

            // Process claims data
            const allClaims = [];
            for (const tier in mServerDB.claims) {
                for (const claim of mServerDB.claims[tier] || []) {
                    allClaims.push({ ...claim, tier });
                    uniqueOwners.add(claim.owner);
                    
                    if (claim.timestamp) {
                        if (isWithinLastWeek(claim.timestamp)) {
                            
                            // Update last claimed timestamp for each tier
                            if (!lastClaimedByTier[tier] || new Date(claim.timestamp) > new Date(lastClaimedByTier[tier])) {
                                lastClaimedByTier[tier] = claim.timestamp;
                            }

                            claimTimesByTier[tier].push(new Date(claim.timestamp));
                            
                            const printNum = claim.print;
                            const timestamp = new Date(claim.timestamp);
                            if (printNum >= 1 && printNum <= 10) claimTimesByPrintRange.SP.push(timestamp);
                            else if (printNum >= 11 && printNum <= 99) claimTimesByPrintRange.LP.push(timestamp);
                            else if (printNum >= 100 && printNum <= 499) claimTimesByPrintRange.MP.push(timestamp);
                            else if (printNum >= 500 && printNum <= 2000) claimTimesByPrintRange.HP.push(timestamp);
                        }
                        
                        if (isWithinLastHour(claim.timestamp)) {
                            recentUniqueOwners.add(claim.owner);
                            // Only consider claims from last hour for best print
                            if (!bestPrint || isHigherQuality({ ...claim, tier }, { ...bestPrint, tier: bestPrint.tier })) {
                                bestPrint = { ...claim, tier };
                            }
                        }
                    }
                }
            }

            // Sort all claims by timestamp (newest first) and get the last 30
            allClaims.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            const last30Claims = allClaims.slice(0, 30);

            // Calculate print range counts for last 30 claims
            const printRangeCounts = {
                SP: 0,
                LP: 0,
                MP: 0,
                HP: 0
            };
            last30Claims.forEach(claim => {
                const quality = getPrintQuality(claim.print);
                if (printRangeCounts.hasOwnProperty(quality)) {
                    printRangeCounts[quality]++;
                }
            });

            const totalClaims = Object.values(tierCounts).reduce((a, b) => a + b, 0);
            const totalPrints = Object.values(printRangeCounts).reduce((a, b) => a + b, 0);

            const calculateAverageTimeBetweenClaims = (times) => {
                if (!times || times.length === 0) return null;
                
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
            };

            // Create base embed
            const embed = new EmbedBuilder()
                .setColor('#FFC0CB')
                .setAuthor({
                    name: `${interaction.guild.name} Server Stats`,
                    iconURL: interaction.guild.iconURL()
                })
                .setThumbnail(interaction.guild.iconURL())
                .setFooter({ 
                    text: `Mazoku stats Auto-Summon` 
                });

            // Handle different stat types
            switch(statType) {
                case 'overview':
                    embed.addFields({ 
                        name: `Total Claims This Month:  ${totalClaims.toString()}`, 
                        value: `*Active Players ( Last 1 Hour )*: ${recentUniqueOwners.size.toString()}`,
                    });
                    embed.addFields({
                        name: 'Last Claimed Timestamps',
                        value: Object.entries(lastClaimedByTier)
                            .filter(([_, timestamp]) => timestamp !== null)
                            .map(([tier, timestamp]) => `${getTierEmoji(tier)}: <t:${isoToUnixTimestamp(timestamp)}:R>`)
                            .join('\n') || '*No claims found*'
                    });
                    break;

                case 'best':
                    if (bestPrint) {
                        try {
                            const enrichedCard = await handleMazokuAPICall(async () => {
                                return await enrichClaimWithCardData(bestPrint);
                            });
                            
                            if (enrichedCard && enrichedCard.card) {
                                const makers = enrichedCard.card.makers?.map(id => `<@${id}>`).join(', ') || '*Data Unavailable*';
                                const cardName = enrichedCard.cardName || '*Data Unavailable*';
                                const series = enrichedCard.card.series || '*Data Unavailable*';
                                
                                embed.addFields({
                                    name: 'Best Drop (Last 1 Hour)',
                                    value: `*${series}*\n` +
                                           `${getTierEmoji(bestPrint.tier)} **${cardName}** #**${enrichedCard.print}** \n` +
                                           `**Maker(s)**: ${makers}\n` +
                                           `**Owner**: ${enrichedCard.owner}\n` +
                                           `**Claimed**: <t:${isoToUnixTimestamp(enrichedCard.timestamp)}:R>`
                                })
                                .setThumbnail(`https://cdn.mazoku.cc/packs/${bestPrint.cardID}`);
                            } else {
                                embed.addFields({
                                    name: 'Best Drop (Last 1 Hour)',
                                    value: '*No drops in the last 1 hour*'
                                });
                            }
                        } catch (error) {
                            if (error.message === "The Mazoku Servers are currently unavailable. Please try again later.") {
                                return await interaction.editReply(error.message);
                            }
                            console.error('Error enriching card data:', error);
                            embed.addFields({
                                name: 'Best Drop (Last 1 Hour)',
                                value: '*Data Unavailable*'
                            });
                        }
                    } else {
                        embed.addFields({
                            name: 'Best Drop (Last 1 Hour)',
                            value: '*No drops in the last 1 hour*'
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
                        name: 'Print Distribution (Last 30 Claims)',
                        value: Object.entries(printRangeCounts)
                            .filter(([_, count]) => count > 0)
                            .map(([range, count]) => {
                                const percentage = totalPrints > 0 ? (count / totalPrints) * 100 : 0;
                                return `**${range}** (${getRangeDescription(range)}): **${count}** ${getLoadBar(percentage)} *${percentage.toFixed(2)}* **%**`;
                            })
                            .join('\n') || '*No print data available for the last 30 claims*'
                    });
                    break;

                case 'tiertimes':
                    embed.addFields({
                        name: 'Average Time Between Claims by Tier (Last 1 Week)',
                        value: Object.entries(claimTimesByTier)
                            .filter(([_, times]) => times.length > 0)
                            .map(([tier, times]) => {
                                const avgTime = calculateAverageTimeBetweenClaims(times);
                                return `${getTierEmoji(tier)}: ${avgTime || '*Data Unavailable*'}`;
                            })
                            .join('\n') || '*No claim data available for the last 1 week*'
                    });
                    break;

                case 'printtimes':
                    embed.addFields({
                        name: 'Average Print Claim Time (Last 1 Week)',
                        value: Object.entries(claimTimesByPrintRange)
                            .filter(([_, times]) => times.length > 0)
                            .map(([range, times]) => {
                                const avgTime = calculateAverageTimeBetweenClaims(times);
                                return `**${range}** (${getRangeDescription(range)}): ${avgTime || '*Data Unavailable*'}`;
                            })
                            .join('\n') || '*No print claim data available for the last 1 week*'
                    });
                    break;
            }

            return await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in serverstats command:', error);
            
            const errorMessage = error.message === "The Mazoku Servers are currently unavailable. Please try again later."
                ? error.message
                : 'An error occurred while fetching server stats.';
            
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
