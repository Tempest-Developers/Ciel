require('dotenv').config();
const { ButtonBuilder, ActionRowBuilder, ButtonStyle, DiscordAPIError } = require('discord.js');
let lastTimestamps = {};

module.exports = async (client, oldMessage, newMessage, exemptBotId) => {
    try {
        // Check if the client is already connected
        // if (!client.isConnected()) {
        //     await client.connect();
        // }

        const database = client.database;

        // Check if edit is from exempt bot
        if (newMessage.author.id !== exemptBotId) {
            return;
        }

        // Check if message has embeds
        if (!newMessage.embeds.length) {
            return;
        }

        // Get the new embed
        const newEmbed = newMessage.embeds[0];

        // Initialize an array to store embed data
        const serverClaims = [];

        // Check if any field has the keyword "made by"
        newEmbed.fields.forEach(async (field) => {
            if (field.value.includes('made by') && newMessage.content === "Claimed and added to inventory!") {
                // Format the title part
                const match = newEmbed.title.match(/<:(.+?):(\d+)> (.+?) \*#(\d+)\*/);
                if (match) {
                    const guildId = newMessage.guild.id;
                    const timestamp = newEmbed.timestamp;

                    if (!lastTimestamps[guildId]) {
                        lastTimestamps[guildId] = new Date().toISOString();
                    }

                    if (!lastTimestamps[guildId] || timestamp > lastTimestamps[guildId]) {
                        lastTimestamps[guildId] = timestamp;
                        const cardClaimed = {
                            tier: match[1],
                            claimedID: match[2],
                            cardName: match[3],
                            print: match[4],
                            timestamp: newEmbed.timestamp,
                            fieldName: field.name,
                            fieldValue: field.value
                        };

                        serverClaims.push(cardClaimed);
                        console.warn(`GUILD: ${newMessage.guild.name} | ${newMessage.guild.id}`);
                        console.log('Formatted Title:', cardClaimed);

                        const serverId = newMessage.guild.id;
                        const serverData = await database.getServerData(serverId);

                        if (serverData) {
                            let existingClaims = serverData.claims ? serverData.claims : [];
                            let existingCT = serverData.tierCounts[0] || 0;
                            let existingRT = serverData.tierCounts[1] || 0;
                            let existingSR = serverData.tierCounts[2] || 0;
                            let existingSSR = serverData.tierCounts[3] || 0;

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

                            await database.addClaim(serverId, cardClaimed)
                            console.log("Completed Server Database Updating");

                            const getLoadBar = (percentage) => {
                                percentage = Math.floor(percentage / 5) * 5;
                                const fullBars = Math.floor(percentage / 20);
                                const remainder = (percentage % 20) / 5;
                                const loadBarEmojis = [
                                    '<:loadBar0:1300928505487294514>',
                                    '<:loadBar5:1300928503155261522>',
                                    '<:loadBar10:1300928515172208803>',
                                    '<:loadBar15:1300928511355392052>',
                                    '<:loadBar20:1300928508553461852>'
                                ];
                                let loadBar = '';

                                for (let i = 0; i < fullBars; i++) {
                                    loadBar += loadBarEmojis[4];
                                }

                                if (remainder > 0) {
                                    loadBar += loadBarEmojis[remainder];
                                }

                                const totalSegments = fullBars + (remainder > 0 ? 1 : 0);
                                for (let i = totalSegments; i < 5; i++) {
                                    loadBar += loadBarEmojis[0];
                                }

                                return loadBar;
                            };

                            const total = existingSSR + existingSR + existingRT + existingCT;

                            const tiers = {
                                SSR: { count: existingSSR, total },
                                SR: { count: existingSR, total },
                                R: { count: existingRT, total },
                                C: { count: existingCT, total }
                            };

                            const embedField3 = existingClaims.slice(-5).map((claim) => {
                                let content;
                                switch (claim.tier) {
                                    case 'CT':
                                        content = `- <:C_Gate:1300919916685164706> **${claim.cardName}** #**${claim.print}**`;
                                        break;
                                    case 'RT':
                                        content = `- <:R_Gate:1300919898209386506> **${claim.cardName}** #**${claim.print}**`;
                                        break;
                                    case 'SRT':
                                        content = `- <:SR_Gate:1300919875757146214> **${claim.cardName}** #**${claim.print}**`;
                                        break;
                                    case 'SSRT':
                                        content = `- <:SSR_Gate:1300919858053124163> **${claim.cardName}** #**${claim.print}**`;
                                        break;
                                    default:
                                        content = `Unknown`;
                                }
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

                            let unixTimestamp;
                            if (newMessage.guild.id === "1240866080985976844") {  // GATE Guild
                                unixTimestamp = 1730253600;
                            } else if (newMessage.guild.id === "1270793006856929373") { // How to train a guild Guild
                                unixTimestamp = 1730251800;
                            } else if (newMessage.guild.id === "736186984518778880") {  // Wine_Tempress
                                unixTimestamp = 1730340000;
                            } else if (newMessage.guild.id === "980749417860710440") {  // TGL
                                unixTimestamp = 1730574000;
                            } else {
                                unixTimestamp = 1730226600;
                            }

                            const newEmbedMessage = {
                                title: `${newMessage.guild.name} Server Stats`,
                                description: `Since <t:${unixTimestamp}:R>`,
                                fields: [
                                    {
                                        name: 'Tier Percentages',
                                        value: `\n- <:SSR_Gate:1300919858053124163> ${getLoadBar((tiers.SSR.count / tiers.SSR.total) * 100)} **${(tiers.SSR.count / tiers.SSR.total * 100).toFixed(2)}**%\n- <:SR_Gate:1300919875757146214> ${getLoadBar((tiers.SR.count / tiers.SR.total) * 100)} **${(tiers.SR.count / tiers.SR.total * 100).toFixed(2)}**%\n- <:R_Gate:1300919898209386506> ${getLoadBar((tiers.R.count / tiers.R.total) * 100)} **${(tiers.R.count / tiers.R.total * 100).toFixed(2)}**%\n- <:C_Gate:1300919916685164706> **${getLoadBar((tiers.C.count / tiers.C.total) * 100)} ${(tiers.C.count / tiers.C.total * 100).toFixed(2)}**%\t`,
                                        inline: true
                                    },
                                    {
                                        name: 'Tier Counts',
                                        value: `- <:SSR_Gate:1300919858053124163> **${tiers.SSR.count}**\n- <:SR_Gate:1300919875757146214> **${tiers.SR.count}**\n- <:R_Gate:1300919898209386506> **${tiers.R.count}**\n- <:C_Gate:1300919916685164706> **${tiers.C.count}**`,
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

                            let newFeature = `🆕**Command \`/recent\`**\n`;

                            let giveawayMessage = ""//newFeature;
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
