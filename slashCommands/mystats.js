const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const getTierEmoji = require('../utility/getTierEmoji');
const getLoadBar = require('../utility/getLoadBar');
const { enrichClaimWithCardData } = require('../utility/cardAPI');
const { handleInteraction, handleCommandError, safeDefer } = require('../utility/interactionHandler');

// Create a cooldown collection
const cooldowns = new Map();
const COOLDOWN_DURATION = 5000; // 5 seconds in milliseconds

// Function to check if timestamp is within last 30 minutes
const isWithinLast30Minutes = (timestamp) => {
    const thirtyMinutesAgo = Date.now() - (30 * 60 * 1000);
    return new Date(timestamp).getTime() > thirtyMinutesAgo;
};

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
            // Check cooldown
            const userId = interaction.user.id;
            const guildId = interaction.guild.id;
            const cooldownKey = `${userId}-${guildId}`;

            if (cooldowns.has(cooldownKey)) {
                const expirationTime = cooldowns.get(cooldownKey);
                const now = Date.now();
                
                if (now < expirationTime) {
                    const timeLeft = (expirationTime - now) / 1000;
                    return await handleInteraction(interaction, {
                        content: `Please wait ${timeLeft.toFixed(1)} more seconds before using this command again.`,
                        ephemeral: true
                    });
                }
            }

            // Defer reply immediately to prevent timeout
            await safeDefer(interaction);

            const targetUser = interaction.options.getUser('user') || interaction.user;
            const category = interaction.options.getString('category');

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

            // Create base embed template
            const embed = new EmbedBuilder()
                .setColor('#FFC0CB')
                .setAuthor({
                    name: `${targetUser.username}'s Stats`, 
                    iconURL: targetUser.displayAvatarURL(),
                    url: `https://mazoku.cc/user/${targetUser.id}`
                })
                .setThumbnail(targetUser.displayAvatarURL())
                .setFooter({ text: 'Mazoku stats Auto-Summon' });

            switch (category) {
                case 'overview':
                    embed.setTitle('Overview')
                        .addFields({ 
                            name: `Total Claims: ${totalClaims.toString()}`,
                            value: `*Claims in last 30 minutes*: ${recentClaimsCount.toString()}`
                        });
                    break;

                case 'best':
                    embed.setTitle('Best Card (Last 30 Minutes)');
                    if (bestCard) {
                        try {
                            const enrichedCard = await enrichClaimWithCardData(bestCard);
                            if (enrichedCard && enrichedCard.card) {
                                const makers = enrichedCard.card.makers?.map(id => `<@${id}>`).join(', ') || '*Data Unavailable*';
                                const cardName = enrichedCard.cardName || '*Data Unavailable*';
                                const series = enrichedCard.card.series || '*Data Unavailable*';
                                
                                embed.addFields({
                                    name: 'Card Details',
                                    value: `*${series}*\n` +
                                           `${getTierEmoji(bestCard.tier)} **${cardName}** #**${enrichedCard.print}** \n` +
                                           `**Maker(s)**: ${makers}\n` +
                                           `**Owner**: ${enrichedCard.owner}\n` +
                                           `**Claimed**: <t:${isoToUnixTimestamp(enrichedCard.timestamp)}:R>`
                                })
                                .setThumbnail(`https://cdn.mazoku.cc/packs/${bestCard.cardID}`);
                            } else {
                                embed.addFields({
                                    name: 'No Cards',
                                    value: '*No drops in the last 30 minutes*'
                                });
                            }
                        } catch (error) {
                            console.error('Error enriching card data:', error);
                            embed.addFields({
                                name: 'Error',
                                value: '*Data Unavailable*'
                            });
                        }
                    } else {
                        embed.addFields({
                            name: 'No Cards',
                            value: '*No drops in the last 30 minutes*'
                        });
                    }
                    break;

                case 'prints':
                    embed.setTitle('Print Distribution')
                        .addFields({
                            name: 'Distribution',
                            value: Object.entries(printRangeCounts)
                                .map(([range, count]) => {
                                    const percentage = totalPrints > 0 ? (count / totalPrints) * 100 : 0;
                                    return `**${range}** (${getRangeDescription(range)}): **${count}** ${getLoadBar(percentage)} *${percentage.toFixed(0)}* **%**`;
                                })
                                .join('\n')
                        });
                    break;

                case 'tiers':
                    embed.setTitle('Tier Distribution')
                        .addFields({
                            name: 'Distribution',
                            value: Object.entries(tierCounts)
                                .map(([tier, count]) => {
                                    const percentage = totalClaims > 0 ? (count / totalClaims) * 100 : 0;
                                    return `${getTierEmoji(tier)} **${count}** ${getLoadBar(percentage)} *${percentage.toFixed(0)}* **%**`;
                                })
                                .join('\n')
                        });
                    break;

                case 'tier_times':
                    embed.setTitle('Average Time Between Claims by Tier')
                        .addFields({
                            name: 'Claim Times',
                            value: Object.entries(claimTimesByTier)
                                .filter(([_, times]) => times.length > 0)
                                .map(([tier, times]) => {
                                    const avgTime = calculateAverageTimeBetweenClaims(times);
                                    return `${getTierEmoji(tier)}: ${avgTime || '*Data Unavailable*'}`;
                                })
                                .join('\n') || '*Data Unavailable*'
                        });
                    break;

                case 'print_times':
                    embed.setTitle('Average Print Claim Times')
                        .addFields({
                            name: 'Claim Times',
                            value: Object.entries(claimTimesByPrintRange)
                                .filter(([_, times]) => times.length > 0)
                                .map(([range, times]) => {
                                    const avgTime = calculateAverageTimeBetweenClaims(times);
                                    return `**${range}** (${getRangeDescription(range)}): ${avgTime || '*Data Unavailable*'}`;
                                })
                                .join('\n') || '*Data Unavailable*'
                        });
                    break;
            }

            await handleInteraction(interaction, { embeds: [embed] }, 'editReply');

            // Set cooldown
            cooldowns.set(cooldownKey, Date.now() + COOLDOWN_DURATION);
            setTimeout(() => cooldowns.delete(cooldownKey), COOLDOWN_DURATION);

        } catch (error) {
            await handleCommandError(interaction, error, 'An error occurred while fetching stats.');
        }
    },
};

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
