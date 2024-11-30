const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const getTierEmoji = require('../utility/getTierEmoji');
const getLoadBar = require('../utility/getLoadBar');
const { enrichClaimWithCardData } = require('../utility/cardAPI');
const { handleInteraction, handleCommandError, safeDefer } = require('../utility/interactionHandler');

// Add cooldown system
const cooldowns = new Map();
const COOLDOWN_DURATION = 5000; // 5 seconds in milliseconds

// Define tier cooldowns in seconds
const TIER_COOLDOWNS = {
    CT: 120,
    RT: 300,
    SRT: 900,
    SSRT: 3600,
    URT: 3600,
    EXT: 3600
};

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
        .setName('mystats')
        .setDescription('Shows your combined auto and manual claim stats for this server')
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
                ))
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to check stats for (default: yourself)')
                .setRequired(false)),

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
            const targetUser = interaction.options.getUser('user') || interaction.user;

            // Get server settings to check if stats are allowed
            const serverSettings = await database.getServerSettings(guildId);
            if (!serverSettings?.settings?.allowShowStats) {
                return await handleInteraction(interaction, {
                    content: 'Stats are currently disabled in this server.',
                    ephemeral: true
                }, 'editReply');
            }

            // Get user data
            const userData = await database.getPlayerData(targetUser.id, guildId);
            if (!userData) {
                return await handleInteraction(interaction, {
                    content: 'No data found for this user.',
                    ephemeral: true
                }, 'editReply');
            }

            // Track best print overall and unique owners
            let bestPrint = null;
            const uniqueOwners = new Set();
            const recentUniqueOwners = new Set();
            const claimTimesByTier = {
                CT: [],
                RT: [],
                SRT: [],
                SSRT: [],
                URT: [],
                EXT: []
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
                SSRT: null,
                URT: null,
                EXT: null
            };

            // Calculate tier counts
            const tierCounts = {
                CT: userData.counts[0] || 0,
                RT: userData.counts[1] || 0,
                SRT: userData.counts[2] || 0,
                SSRT: userData.counts[3] || 0,
                URT: userData.counts[4] || 0,
                EXT: userData.counts[5] || 0
            };

            // Process claims data
            function processClaims(claims) {
                for (const tier in claims) {
                    for (const claim of claims[tier] || []) {
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
                                if (!bestPrint || isHigherQuality({ ...claim, tier }, bestPrint)) {
                                    bestPrint = { ...claim, tier };
                                }
                            }
                        }
                    }
                }
            }

            // Process all claims
            processClaims(userData.claims);

            // Calculate print range counts for last hour
            const printRangeCounts = {
                SP: claimTimesByPrintRange.SP.filter(isWithinLastHour).length,
                LP: claimTimesByPrintRange.LP.filter(isWithinLastHour).length,
                MP: claimTimesByPrintRange.MP.filter(isWithinLastHour).length,
                HP: claimTimesByPrintRange.HP.filter(isWithinLastHour).length
            };

            const totalClaims = Object.values(tierCounts).reduce((a, b) => a + b, 0);
            const totalPrints = Object.values(printRangeCounts).reduce((a, b) => a + b, 0);

            // Create base embed
            const embed = new EmbedBuilder()
                .setColor('#FFC0CB')
                .setAuthor({
                    name: `${targetUser.username}'s Combined Stats`,
                    iconURL: targetUser.displayAvatarURL(),
                    url: `https://mazoku.cc/user/${targetUser.id}`
                })
                .setThumbnail(targetUser.displayAvatarURL())
                .setFooter({ 
                    text: `Mazoku stats | Player: ${targetUser.username} | Guild: ${interaction.guild.name}` 
                });

            // Handle different stat types
            switch(statType) {
                case 'overview':
                    embed.addFields({ 
                        name: `Total Claims:  ${totalClaims.toString()}`, 
                        value: `*Active in Last 1 Hour*: ${recentUniqueOwners.size.toString()}`,
                    });
                    embed.addFields({
                        name: `Cooldown for ${interaction.guild.name}`,
                        value: Object.entries(lastClaimedByTier)
                            .map(([tier, timestamp]) => {
                                if (["EXT", "URT"].includes(tier)) {
                                    return; // or return a specific message
                                }

                                if (!timestamp) return `${getTierEmoji(tier)}: Ready`;
                                const cooldownEnd = new Date(timestamp).getTime() + TIER_COOLDOWNS[tier] * 1000;
                                const now = Date.now();
                                if (now >= cooldownEnd) {
                                    return `${getTierEmoji(tier)}: Ready`;
                                } else {
                                    const timeLeft = Math.floor((cooldownEnd - now) / 1000);
                                    return `${getTierEmoji(tier)}: <t:${Math.floor(cooldownEnd / 1000)}:R>`;
                                }
                            })
                            .join('\n') || '*No claim data available*'
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
                        name: 'Print Distribution (Last 1 Hour)',
                        value: Object.entries(printRangeCounts)
                            .filter(([_, count]) => count > 0)
                            .map(([range, count]) => {
                                const percentage = totalPrints > 0 ? (count / totalPrints) * 100 : 0;
                                return `**${range}** (${getRangeDescription(range)}): **${count}** ${getLoadBar(percentage)} *${percentage.toFixed(2)}* **%**`;
                            })
                            .join('\n') || '*No print data available for the last 1 hour*'
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
            console.error('Error in mystats command:', error);
            
            const errorMessage = error.message === "The Mazoku Servers are currently unavailable. Please try again later."
                ? error.message
                : 'An error occurred while fetching stats.';
            
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

// Helper functions
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
