require('dotenv').config();
const { ButtonBuilder, ActionRowBuilder, ButtonStyle, DiscordAPIError } = require('discord.js');
const findUserId = require('../utility/findUserId');
const getLoadBar = require('./getLoadBar'); // Import getLoadBar
const getTierEmoji = require('./getTierEmoji'); // Import getTierEmoji

let lastTimestamps = {};
let lastRemberedEmbed = "";

module.exports = async (client, oldMessage, newMessage, exemptBotId) => {
    try {

        const { getServerData, getPlayerData, createServer, createPlayer, addClaim, addManualClaim } = await client.database;

        // Check if edit is from exempt bot
        if (oldMessage.author.id !== exemptBotId) {
            return;
        }

        // Check if edit is from exempt bot
        if (!oldMessage.embeds.length) {
            return;
        }

        // Check if message has embeds
        if (!newMessage.embeds.length) {
            return;
        }

        // Get the new embed
        const oldEmbed = oldMessage.embeds[0];
        const newEmbed = newMessage.embeds[0];

        if (!oldEmbed.title || !oldEmbed.title.includes("Automatic Summon!")) {
            return;
        }

        if(lastRemberedEmbed==oldEmbed){
            return;
        }else{
            lastRemberedEmbed=oldMessage.embeds[0];
        }

        // Initialize an array to store embed data
        const serverClaims = [];

        // Check if any field has the keyword "made by"
        newEmbed.fields.forEach(async (field) => {
            if (field.value.includes('made by') && newMessage.content === "Claimed and added to inventory!") {
                // Format the title part
                const match = newEmbed.title.match(/<:(.+?):(\d+)> (.+?) \*#(\d+)\*/);
                if (match) {
                    const userId = await findUserId(client, field.name.split(" ")[2]);
                    const guildId = newMessage.guild.id;
                    const timestamp = newEmbed.timestamp;

                    if (!lastTimestamps[guildId]) {
                        lastTimestamps[guildId] = new Date().toISOString();
                    }

                    if (timestamp > lastTimestamps[guildId]) {
                        lastTimestamps[guildId] = timestamp;
                        const cardClaimed = {
                            claimedID: match[2],
                            userID: userId,
                            serverID: guildId,
                            cardName: match[3],
                            cardID: newEmbed.image.url.split("/")[4],
                            owner: field.name.split(" ")[2],
                            artist: field.value.split(" ")[3],
                            print: match[4],
                            tier: match[1],
                            timestamp: newEmbed.timestamp
                        };

                        serverClaims.push(cardClaimed);
                        console.warn(`GUILD: ${newMessage.guild.name} | ${newMessage.guild.id}`);
                        console.log('Card Claimed:', cardClaimed);

                        let serverData = await getServerData(guildId);
                        let serverPlayerData = await getPlayerData(userId, guildId);

                        if (!serverData) {
                            await createServer(guildId);
                            serverData = await getServerData(guildId);
                        }
                        if (!serverPlayerData) {
                            await createPlayer(userId, guildId);
                            serverPlayerData = await getPlayerData(userId, guildId);
                        }

                        if (serverData) {
                            let existingClaims = serverData.claims ? serverData.claims : [];
                            let existingCT = serverData.counts[0] || 0;
                            let existingRT = serverData.counts[1] || 0;
                            let existingSR = serverData.counts[2] || 0;
                            let existingSSR = serverData.counts[3] || 0;

                            const nextUniqueId = existingClaims.length;
                            const existingIndex = existingClaims.findIndex(ec => ec.uniqueId === nextUniqueId);

                            if (existingIndex !== -1) {
                                existingClaims[existingIndex] = { ...cardClaimed, uniqueId: nextUniqueId };
                            } else {
                                existingClaims.push({ ...cardClaimed, uniqueId: nextUniqueId });
                            }

                            if (cardClaimed.tier === 'CT') {
                                existingCT++;
                            } else if (cardClaimed.tier === 'RT') {
                                existingRT++;
                            } else if (cardClaimed.tier === 'SRT') {
                                existingSR++;
                            } else if (cardClaimed.tier === 'SSRT') {
                                existingSSR++;
                            }

                            await addClaim(guildId, userId, cardClaimed)
                    
                            console.log(`Updated ${userId} - ${cardClaimed.owner} player |  Server ${guildId} - ${newMessage.guild.name} Database`);

                            const total = existingSSR + existingSR + existingRT + existingCT;

                            const tiers = {
                                SSR: { count: existingSSR, total },
                                SR: { count: existingSR, total },
                                R: { count: existingRT, total },
                                C: { count: existingCT, total }
                            };

                            const embedField3 = existingClaims.slice(-5).map((claim) => {
                                let content = `- ${getTierEmoji(claim.tier)} **${claim.cardName}** #**${claim.print}**`;
                                return content;
                            }).join('\n');

                            const convertDateToUnix = (date_string) => {
                                const date = new Date(date_string);
                                return parseInt(date.getTime() / 1000);
                            };

                            const embedField4 = existingClaims.slice(-5).map((claim) => {
                                const claimUnixTimestamp = convertDateToUnix(claim.timestamp);
                                let content = `- **${claim.fieldName.split(" ")[2]}** | <t:${claimUnixTimestamp}:R>`;
                                return content;
                            }).join('\n');

                            let unixTimestamp = 1731133800;

                            const newEmbedMessage = {
                                title: `${newMessage.guild.name} Server Stats`,
                                description: `Since <t:${unixTimestamp}:R>`,
                                fields: [
                                    {
                                        name: 'Tier Percentages',
                                        value: `\n- ${getTierEmoji('SSRT')} ${getLoadBar((tiers.SSR.count / tiers.SSR.total) * 100)} **${(tiers.SSR.count / tiers.SSR.total * 100).toFixed(2)}**%\n- ${getTierEmoji('SRT')} ${getLoadBar((tiers.SR.count / tiers.SR.total) * 100)} **${(tiers.SR.count / tiers.SR.total * 100).toFixed(2)}**%\n- ${getTierEmoji('RT')} ${getLoadBar((tiers.R.count / tiers.R.total) * 100)} **${(tiers.R.count / tiers.R.total * 100).toFixed(2)}**%\n- ${getTierEmoji('CT')} **${getLoadBar((tiers.C.count / tiers.C.total) * 100)} ${(tiers.C.count / tiers.C.total * 100).toFixed(2)}**%\t`,
                                        inline: true
                                    },
                                    {
                                        name: 'Tier Counts',
                                        value: `- ${getTierEmoji('SSRT')} **${tiers.SSR.count}**\n-${getTierEmoji('SRT')} **${tiers.SR.count}**\n- ${getTierEmoji('RT')} **${tiers.R.count}**\n- ${getTierEmoji('CT')} **${tiers.C.count}**`,
                                        inline: true
                                    },
                                    {
                                        name: '\u200B',
                                        value: '\u200B',
                                        inline: true
                                    },
                                    {
                                        name: 'Claimed Cards',
                                        value: embedField3,
                                        inline: true
                                    },
                                    {
                                        name: 'Owners and Timestamps',
                                        value: embedField4,
                                        inline: true
                                    }
                                ],
                                footer: { text: `Database reset expected frequently. Alpha Version` }
                            };

                            // Create first button (existing)
                            const statsButton = new ButtonBuilder()
                                .setCustomId('viewServerStats')
                                .setLabel('Server Stats')
                                .setStyle(ButtonStyle.Primary);

                            let batchNowReferTime = Math.floor(Date.now() / 1000);
                            let batchTime = 1730743200;

                            let newFeature = `🌟**Command \`/recent\`**\n🌟**Command \`/search\`**\n`;

                            let giveawayMessage = newFeature;
                            let row;
                            row = new ActionRowBuilder()
                                .addComponents(statsButton);

                            const usedUsers = new Set(); // Define usedUsers as a Set
                            const buttonMessage = await newMessage.channel.send({
                                content: `${giveawayMessage}`,
                                components: [row]
                            });

                            const collector = buttonMessage.createMessageComponentCollector({
                                filter: i => i.customId === 'viewServerStats',
                                time: 600000,
                            });
                            collector.on('collect', async interaction => {
                                try {
                                    // Check if user has already used the button
                                    if (usedUsers.has(interaction.user.id)) {
                                        await interaction.reply({
                                            content: 'You have already viewed the stats!',
                                            ephemeral: true
                                        });
                                        return;
                                    }
                                    await interaction.deferReply({ ephemeral: true });
                                    await interaction.followUp({
                                        embeds: [newEmbedMessage],
                                        ephemeral: true
                                    });
                                    // Add user to the set of users who have used the button
                                    usedUsers.add(interaction.user.id);
                                } catch (error) {
                                    console.error('Error handling button interaction:', error);
                                }
                            });
                            collector.on('end', async () => {
                                try {
                                    const disabledButton = ButtonBuilder.from(statsButton).setDisabled(true);
                                    const disabledRow = new ActionRowBuilder()
                                        .addComponents(disabledButton);
                                    await buttonMessage.edit({
                                        components: [disabledRow]
                                    });
                                } catch (error) {
                                    console.error('Error disabling button:', error);
                                }
                            });
                            
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error handling summon embed edit:', error);
    } finally {
        // await client.close();
    }
}
