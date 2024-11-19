const { EmbedBuilder } = require('discord.js');
const handleCreateMazokuMessage = require('../utility/handleCreateMazokuMessage');
const getTierEmoji = require('../utility/getTierEmoji');
const axios = require('axios');
require('dotenv').config();
const config = require('../config.json');

let lastCheck = 0;
const CHECK_INTERVAL = 60000; // 1 minute in milliseconds
const GUILD_CHANNELS = {
    '1240866080985976844': '1307335913462038639' // Map of guild ID to channel ID
};

module.exports = {
    name: 'messageCreate',
    async execute(message, { database }) {
        // Skip if no database
        if (!database || !database.mGiveawayDB) {
            console.error('Database or mGiveawayDB not available');
            return;
        }

        // Handle Mazoku messages immediately without rate limiting
        if (message.author.id === config.mazokuID) {
            await handleCreateMazokuMessage(message, config.mazokuID, database);
            return;
        }

        // Rate limit check for giveaway processing only
        const now = Math.floor(Date.now() / 1000); // Convert to unix timestamp
        if (now - lastCheck < CHECK_INTERVAL / 1000) {
            return;
        }
        lastCheck = now;

        try {
            // Find active giveaways that have ended
            const endedGiveaways = await database.mGiveawayDB.find({
                active: true,
                endTimestamp: { $lt: now }
            }).toArray();

            for (const giveaway of endedGiveaways) {
                try {
                    // Handle case with no participants
                    if (!giveaway.entries || giveaway.entries.length === 0) {
                        // Build description based on giveaway level
                        let description = '';
                        if (giveaway.level === 0) {
                            description = giveaway.item?.description || 'No Description Set';
                        } else if (giveaway.level === 1) {
                            description = `**Prize:** ${giveaway.item?.name || 'No Prize Set'}\n` +
                                        `**Message:** ${giveaway.item?.description || 'No Message Set'}`;
                        } else if (giveaway.level === 2) {
                            const prizes = giveaway.item?.name?.split(' | ') || ['No Prizes Set'];
                            description = `**Prizes:**\n${prizes.map((prize, i) => `${i + 1}. ${prize}`).join('\n')}\n\n` +
                                        `**Message:** ${giveaway.item?.description || 'No Message Set'}`;
                        }

                        const noWinnerEmbed = new EmbedBuilder()
                            .setColor('#ff0000')
                            .setTitle('🎉 Giveaway Ended - No Winners')
                            .setDescription(description + '\n\n**Result:** No participants joined this giveaway.')
                            .setImage(giveaway.item?.imageUrl || null)
                            .setTimestamp();

                        // Send no winner announcement to appropriate guild channels
                        for (const [guildId, channelId] of Object.entries(GUILD_CHANNELS)) {
                            try {
                                const guild = await message.client.guilds.fetch(guildId);
                                if (guild) {
                                    const channel = await guild.channels.fetch(channelId);
                                    if (channel) {
                                        await channel.send({ embeds: [noWinnerEmbed] });
                                    }
                                }
                            } catch (err) {
                                console.error(`Error sending to guild ${guildId}:`, err);
                            }
                        }

                        await database.mGiveawayDB.updateOne(
                            { giveawayID: giveaway.giveawayID },
                            { $set: { active: false } }
                        );
                        continue;
                    }

                    // Winner selection based on giveaway level
                    let winners = [];
                    const totalEntries = giveaway.entries.length;

                    // Level 0 and 1: Single winner
                    if (giveaway.level === 0 || giveaway.level === 1) {
                        const winnerEntry = giveaway.entries[Math.floor(Math.random() * totalEntries)];
                        winners.push({
                            userID: winnerEntry.userID,
                            entries: giveaway.entries.filter(entry => entry.userID === winnerEntry.userID).length
                        });
                    } 
                    // Level 2: Multiple winners
                    else if (giveaway.level === 2) {
                        const winnerCount = Math.min(giveaway.amount, totalEntries);
                        const selectedIndexes = new Set();

                        while (winners.length < winnerCount) {
                            let randomIndex;
                            do {
                                randomIndex = Math.floor(Math.random() * totalEntries);
                            } while (selectedIndexes.has(randomIndex));

                            selectedIndexes.add(randomIndex);
                            const winnerEntry = giveaway.entries[randomIndex];
                            
                            // Ensure unique winners
                            if (!winners.some(w => w.userID === winnerEntry.userID)) {
                                winners.push({
                                    userID: winnerEntry.userID,
                                    entries: giveaway.entries.filter(entry => entry.userID === winnerEntry.userID).length
                                });
                            }
                        }
                    }

                    // Build description based on giveaway level
                    let description = '';
                    if (giveaway.level === 0) {
                        description = giveaway.item?.description || 'No Description Set';
                    } else if (giveaway.level === 1) {
                        description = `**Prize:** ${giveaway.item?.name || 'No Prize Set'}\n` +
                                    `**Message:** ${giveaway.item?.description || 'No Message Set'}`;
                    } else if (giveaway.level === 2) {
                        const prizes = giveaway.item?.name?.split(' | ') || ['No Prizes Set'];
                        description = `**Prizes:**\n${prizes.map((prize, i) => `${i + 1}. ${prize}`).join('\n')}\n\n` +
                                    `**Message:** ${giveaway.item?.description || 'No Message Set'}`;
                    }

                    description += `\n\n**Total Entries:** ${totalEntries}`;

                    // Create winner announcement embed
                    const embed = new EmbedBuilder()
                        .setColor('#00ff00')
                        .setTitle('🎉 Giveaway Winners')
                        .setDescription(description)
                        .setImage(giveaway.item?.imageUrl || null)
                        .setTimestamp();

                    // Prepare winner details
                    let winnerDetails = [];
                    if (giveaway.level === 2) {
                        // For level 2, split prizes
                        const prizes = giveaway.item?.name?.split(',') || ['Prize'];
                        winners.forEach((winner, index) => {
                            winnerDetails.push(`🏆 <@${winner.userID}>: ${prizes[index] || 'Prize'}`);
                        });
                    } else {
                        // For levels 0 and 1
                        winnerDetails = winners.map(winner => 
                            `🏆 <@${winner.userID}> (Entries: ${winner.entries})`
                        );
                    }

                    // Add winners to embed
                    embed.addFields({ 
                        name: 'Winners', 
                        value: winnerDetails.join('\n')
                    });

                    // Send winner announcement to appropriate guild channels
                    for (const [guildId, channelId] of Object.entries(GUILD_CHANNELS)) {
                        try {
                            const guild = await message.client.guilds.fetch(guildId);
                            if (guild) {
                                const channel = await guild.channels.fetch(channelId);
                                if (channel) {
                                    await channel.send({ 
                                        embeds: [embed],
                                        content: `Congratulations `+ winners.map(winner => `<@${winner.userID}>!`).join(' ')
                                    });
                                }
                            }
                        } catch (err) {
                            console.error(`Error sending to guild ${guildId}:`, err);
                        }
                    }

                    // Mark giveaway as inactive and store winners
                    await database.mGiveawayDB.updateOne(
                        { giveawayID: giveaway.giveawayID },
                        { 
                            $set: { 
                                active: false,
                                winners: winners.map(winner => ({
                                    userID: winner.userID,
                                    entries: winner.entries,
                                    timestamp: now
                                }))
                            }
                        }
                    );
                } catch (error) {
                    console.error('Error processing giveaway:', error);
                    // Still mark giveaway as inactive even if processing fails
                    await database.mGiveawayDB.updateOne(
                        { giveawayID: giveaway.giveawayID },
                        { $set: { active: false } }
                    );
                }
            }
        } catch (error) {
            console.error('Error checking giveaways:', error);
        }
    },
};
