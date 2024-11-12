const { DiscordAPIError, EmbedBuilder } = require('discord.js');

const GATE_GUILD = '1240866080985976844';

module.exports = async (message, exemptBotId, database) => {
    try {
        // Check if message is from the exempt bot and has an embed
        if (message.author.id !== exemptBotId || !message.embeds.length) {
            return;
        }

        // Get the embed
        const embed = message.embeds[0];
        
        if (!embed.title || !embed.title.includes('Automatic Summon!')) {
            return;
        }

        // Store the original message ID to track edits
        const originalMessageId = message.id;

        // Only setup token system for Gate guild
        if (message.guildId === GATE_GUILD) {
            // Set up message collector for 19 seconds
            const filter = m => !m.author.bot;
            const collector = message.channel.createMessageCollector({ 
                filter, 
                time: 19000 
            });

            collector.on('end', async collected => {
                if (collected.size > 0) {
                    try {
                        // Get Gate server data first
                        const gateServerData = await database.mGateServerDB.findOne({ serverID: GATE_GUILD });
                        
                        // Check if economy is enabled
                        if (!gateServerData || !gateServerData.economyEnabled) {
                            return;
                        }

                        // Get unique participants from collected messages
                        const participants = [...new Set(collected.map(m => m.author.id))];
                        
                        // Determine number of winners (1-3)
                        const numWinners = Math.floor(Math.random() * 3) + 1;
                        
                        // Randomly select winners without duplicates
                        const winners = [];
                        const participantsCopy = [...participants];
                        for (let i = 0; i < numWinners && participantsCopy.length > 0; i++) {
                            const winnerIndex = Math.floor(Math.random() * participantsCopy.length);
                            winners.push(participantsCopy.splice(winnerIndex, 1)[0]);
                        }

                        // Process each winner
                        let rewardMessage = '';
                        let colorEmbed;

                        for (const winnerID of winners) {
                            // Generate token reward with adjusted probabilities
                            let tokenReward;
                            const rand = Math.random() * 100;

                            if (rand < 0.001) { // 0.1% chance of 100 tokens
                                tokenReward = 100;
                                colorEmbed = '#FF00FF'; // Magenta
                            } else if (rand < 0.01) { // 0.9% chance of 50 tokens
                                tokenReward = 50;
                                colorEmbed = '#00FFFF'; // Cyan
                            } else if (rand < 0.1) { // 9% chance of 25 tokens
                                tokenReward = 25;
                                colorEmbed = '#FFFF00'; // Yellow
                            } else { // 90.1% chance of 0-5 tokens
                                tokenReward = Math.floor(Math.random() * 3);
                                colorEmbed = '#00FF00'; // Green
                            }

                            if (tokenReward > 0) {
                                // Get user data
                                let userData = await database.mGateDB.findOne({ userID: winnerID });
                                
                                if (!userData) {
                                    await database.createGateUser(winnerID);
                                    userData = await database.mGateDB.findOne({ userID: winnerID });
                                }

                                // Check max token limit
                                const currentTokens = userData.currency[0];
                                if (currentTokens + tokenReward > 25000) {
                                    tokenReward = Math.max(0, 25000 - currentTokens);
                                }

                                if (tokenReward > 0) {
                                    // Update tokens
                                    await database.mGateDB.updateOne(
                                        { userID: winnerID },
                                        { $inc: { 'currency.0': tokenReward } }
                                    );

                                    // Add to reward message
                                    rewardMessage += `<@${message.guild.members.cache.get(winnerID)?.user.username}> earned ${tokenReward} <:Slime_Token:1304929154285703179>\n`;
                                }
                            }
                        }

                        if (rewardMessage) {
                            const rewardEmbed = new EmbedBuilder()
                                .setColor(colorEmbed)
                                .setTitle('🎉 Token Rewards')
                                .setDescription(rewardMessage)
                                .setFooter({ text: `Among ${participants.length} claimers` });

                            await message.channel.send({ embeds: [rewardEmbed] });
                        }

                    } catch (error) {
                        console.error('Error handling token reward:', error);
                    }
                }
            });
        }

        // Return data for message update event to use
        return {
            messageId: originalMessageId,
            originalEmbed: embed
        };
    } catch (error) {
        if (error instanceof DiscordAPIError && error.code === 50013) {
            console.error('Missing permissions to send message in channel:', message.channel.id);
        } else {
            console.error('Error handling summon embed:', error);
        }
    }
};
