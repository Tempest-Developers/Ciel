const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const getTierEmoji = require('../../../utility/getTierEmoji');
const { createGateUser, getGateUser } = require('../../../database/modules/gate');
const { GIVEAWAY_FIRST_TICKET_FREE } = require('../utils/constants');
const { handleInteraction, handleCommandError, safeDefer } = require('../../../utility/interactionHandler');

module.exports = {
    subcommand: subcommand =>
        subcommand
            .setName('giveaway')
            .setDescription('Show giveaway details and rewards'),

    async execute(interaction, { database }) {
        await safeDefer(interaction, { ephemeral: false });

        try {
            // Ensure user exists in the database
            let user = await getGateUser(interaction.user.id);
            if (!user) {
                await createGateUser(interaction.user.id);
                user = await getGateUser(interaction.user.id);
            }

            const giveaways = await database.getGiveaways(true);
            
            if (!giveaways || giveaways.length === 0) {
                return await handleInteraction(interaction, { 
                    content: '❌ No active giveaways.' 
                }, 'editReply');
            }

            // Create embeds for all active giveaways
            const embeds = [];
            for (const giveaway of giveaways) {
                const userTickets = user?.currency?.[5] || 0;
                const totalEntries = giveaway.entries?.length || 0;
                const userEntries = giveaway.entries?.filter(entry => entry.userID === interaction.user.id)?.length || 0;

                // Build description based on giveaway level
                let description = '';
                if (giveaway.level === 0) {
                    description = giveaway.item?.description || 'No Description Set';
                } else if (giveaway.level === 1) {
                    description = `**Prize:** ${giveaway.item?.name || 'No Prize Set'}\n` +
                                `**Message:** ${giveaway.item?.description || 'No Message Set'}`;
                } else if (giveaway.level === 2) {
                    const prizes = giveaway.item?.name?.split('|').map((p, i) => `${p.trim()}`).join(' ') || 'No Prizes Set';
                    description = `**Prizes:**\n${prizes}\n\n` +
                                `**Message:** ${giveaway.item?.description || 'No Message Set'}`;
                }

                description += `\n\n🎫 Your Tickets: **${userTickets}**\n` +
                             `🎯 Your Entries: **${userEntries}**\n` +
                             `👥 Total Entries: **${totalEntries}**`;

                const embed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle(`🎉 Giveaway`)
                    .setDescription(description)
                    .setThumbnail(giveaway.item?.imageUrl || null)
                    .addFields({
                        name: 'Time Remaining',
                        value: `⏰ Ends <t:${giveaway.endTimestamp}:R>`
                    });

                embeds.push(embed);
            }

            // Create navigation buttons if there are multiple giveaways
            const components = [];
            if (embeds.length > 1) {
                const navRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('giveaway_prev')
                        .setLabel('◀️ Previous')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId('giveaway_next')
                        .setLabel('Next ▶️')
                        .setStyle(ButtonStyle.Secondary)
                );
                components.push(navRow);
            }

            // Create join button
            const joinRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`giveaway_join_${giveaways[0].giveawayID}`)
                    .setLabel(
                        GIVEAWAY_FIRST_TICKET_FREE && !giveaways[0].entries?.some(entry => entry.userID === interaction.user.id) ? 
                        'Join Giveaway (Free)' : 
                        'Join Giveaway (1 Ticket)'
                    )
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(
                        (!GIVEAWAY_FIRST_TICKET_FREE || giveaways[0].entries?.some(entry => entry.userID === interaction.user.id)) && 
                        (user?.currency?.[5] || 0) < 1
                    )
            );
            components.push(joinRow);

            // Store the current page in the button collector
            const message = await handleInteraction(interaction, {
                embeds: [embeds[0]],
                components
            }, 'editReply');

            if (embeds.length > 1) {
                const collector = message.createMessageComponentCollector({ time: 300000 }); // 5 minutes
                let currentPage = 0;

                collector.on('collect', async i => {
                    if (i.user.id !== interaction.user.id) {
                        await handleInteraction(i, { 
                            content: '❌ This is not your giveaway menu.', 
                            ephemeral: true 
                        }, 'reply');
                        return;
                    }

                    try {
                        if (i.customId === 'giveaway_prev' || i.customId === 'giveaway_next') {
                            await i.deferUpdate();
                            currentPage = i.customId === 'giveaway_prev' ? currentPage - 1 : currentPage + 1;

                            const currentGiveaway = giveaways[currentPage];
                            const hasUserEntered = currentGiveaway.entries?.some(entry => entry.userID === i.user.id);
                            const userTickets = (await getGateUser(i.user.id))?.currency?.[5] || 0;

                            // Update navigation buttons
                            const navRow = ActionRowBuilder.from(components[0]);
                            navRow.components[0].setDisabled(currentPage === 0);
                            navRow.components[1].setDisabled(currentPage === embeds.length - 1);

                            // Update join button
                            const joinRow = ActionRowBuilder.from(components[1]);
                            joinRow.components[0]
                                .setCustomId(`giveaway_join_${currentGiveaway.giveawayID}`)
                                .setLabel(
                                    GIVEAWAY_FIRST_TICKET_FREE && !hasUserEntered ? 
                                    'Join Giveaway (Free)' : 
                                    'Join Giveaway (1 Ticket)'
                                )
                                .setDisabled(
                                    (!GIVEAWAY_FIRST_TICKET_FREE || hasUserEntered) && 
                                    userTickets < 1
                                );

                            await i.editReply({
                                embeds: [embeds[currentPage]],
                                components: [navRow, joinRow]
                            });
                        }
                    } catch (error) {
                        await handleCommandError(i, error, '❌ An error occurred. Please try again.');
                    }
                });

                collector.on('end', () => {
                    const disabledComponents = components.map(row => {
                        const newRow = ActionRowBuilder.from(row);
                        newRow.components.forEach(component => component.setDisabled(true));
                        return newRow;
                    });
                    message.edit({ components: disabledComponents }).catch(console.error);
                });
            }
        } catch (error) {
            await handleCommandError(interaction, error, '❌ Error showing giveaway.');
        }
    },

    async handleButton(interaction, { database }) {
        if (interaction.customId.startsWith('giveaway_join_')) {
            const giveawayId = parseInt(interaction.customId.split('_')[2]);
            await this.handleJoinGiveaway(interaction, { database, giveawayId });
        }
    },

    async handleJoinGiveaway(interaction, { database, giveawayId }) {
        try {
            // Ensure user exists in the database
            let user = await getGateUser(interaction.user.id);
            if (!user) {
                await createGateUser(interaction.user.id);
                user = await getGateUser(interaction.user.id);
            }

            const giveaway = await database.getGiveaway(giveawayId);
            
            if (!giveaway || !giveaway.active) {
                return await handleInteraction(interaction, {
                    content: '❌ This giveaway is no longer active.',
                    ephemeral: true
                }, 'reply');
            }

            const { mGateDB, mGiveawayDB } = database;
            const tickets = user?.currency?.[5] || 0;
            const userEntries = giveaway.entries?.filter(entry => entry.userID === interaction.user.id)?.length || 0;
            const isFreeEntry = GIVEAWAY_FIRST_TICKET_FREE && userEntries === 0;

            if (!isFreeEntry && tickets < 1) {
                return await handleInteraction(interaction, {
                    content: '❌ You need at least 1 ticket to join!',
                    ephemeral: true
                }, 'reply');
            }

            try {
                // Only consume ticket if it's a paid entry
                if (!isFreeEntry) {
                    const updateResult = await mGateDB.updateOne(
                        { 
                            userID: interaction.user.id,
                            'currency.5': { $gte: 1 }
                        },
                        { $inc: { 'currency.5': -1 } }
                    );

                    if (updateResult.modifiedCount === 0) {
                        throw new Error('Failed to consume ticket');
                    }
                }

                // Add entry to giveaway
                await mGiveawayDB.updateOne(
                    { giveawayID: giveaway.giveawayID },
                    { 
                        $push: { 
                            entries: { 
                                userID: interaction.user.id,
                                timestamp: Date.now()
                            },
                            logs: { 
                                userID: interaction.user.id, 
                                timestamp: new Date(), 
                                tickets: isFreeEntry ? 0 : 1,
                                freeEntry: isFreeEntry
                            }
                        }
                    }
                );

                const updatedUser = await getGateUser(interaction.user.id);
                const finalGiveaway = await mGiveawayDB.findOne({ giveawayID: giveaway.giveawayID });
                const finalUserEntries = finalGiveaway.entries?.filter(entry => entry.userID === interaction.user.id)?.length || 0;
                const totalEntries = finalGiveaway.entries?.length || 0;
                const remainingTickets = !isFreeEntry ? (updatedUser?.currency?.[5] || 0) : tickets;

                await handleInteraction(interaction, {
                    content: `<@${interaction.user.id}> ${isFreeEntry ? 'got a free entry!' : 'joined the giveaway!'}\n` +
                        `🎫 Remaining Tickets: **${remainingTickets}**\n` +
                        `🎯 Your Entries: **${finalUserEntries}**\n` +
                        `👥 Total Entries: **${totalEntries}**`,
                    ephemeral: false
                }, 'reply');
            } catch (error) {
                console.error('Error in giveaway entry process:', error);
                throw error;
            }
        } catch (error) {
            await handleCommandError(interaction, error, '❌ Error joining giveaway. Please try again in a few moments.');
        }
    }
};
