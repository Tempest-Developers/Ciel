const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const getTierEmoji = require('../../../utility/getTierEmoji');
const { createGateUser, getGateUser } = require('../../../database/modules/gate');
const { GIVEAWAY_FIRST_TICKET_FREE } = require('../utils/constants');

module.exports = {
    subcommand: subcommand =>
        subcommand
            .setName('giveaway')
            .setDescription('Show giveaway details and rewards'),

    async execute(interaction, { database }) {
        await interaction.deferReply({ ephemeral: false });

        try {
            // Ensure user exists in the database
            let user = await getGateUser(interaction.user.id);
            if (!user) {
                await createGateUser(interaction.user.id);
                user = await getGateUser(interaction.user.id);
            }

            const giveaways = await database.getGiveaways(true);
            
            if (!giveaways || giveaways.length === 0) {
                return interaction.editReply({ content: '❌ No active giveaways.' });
            }

            // Create embeds for all active giveaways
            const embeds = [];
            for (const giveaway of giveaways) {
                // Get user's tickets
                const userTickets = user?.currency?.[5] || 0;

                // Get total entries
                const totalEntries = giveaway.entries?.length || 0;
                const userEntries = giveaway.entries?.filter(entry => entry.userID === interaction.user.id)?.length || 0;

                // Build description based on giveaway level
                let description = '';
                if (giveaway.level === 0) {
                    // For Level 0 (Single Card), show card details
                    description = giveaway.item?.description || 'No Description Set';
                } else if (giveaway.level === 1) {
                    // For Level 1 (Custom Item), show prize and message
                    description = `**Prize:** ${giveaway.item?.name || 'No Prize Set'}\n` +
                                `**Message:** ${giveaway.item?.description || 'No Message Set'}`;
                } else if (giveaway.level === 2) {
                    // For Level 2 (Multiple Winners), show all prizes
                    const prizes = giveaway.item?.name?.split('|').map((p, i) => `${p.trim()}`).join(' ') || 'No Prizes Set';
                    description = `**Prizes:**\n${prizes}\n\n` +
                                `**Message:** ${giveaway.item?.description || 'No Message Set'}`;
                }

                // Add statistics to description
                description += `\n\n🎫 Your Tickets: **${userTickets}**\n` +
                             `🎯 Your Entries: **${userEntries}**\n` +
                             `👥 Total Entries: **${totalEntries}**`;

                const embed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle(`🎉 Giveaway #${giveaway.giveawayID}`)
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
                        GIVEAWAY_FIRST_TICKET_FREE ? 
                        'Join Giveaway (1st Free)' : 
                        'Join Giveaway (1 Ticket)'
                    )
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(!GIVEAWAY_FIRST_TICKET_FREE && (user?.currency?.[5] || 0) < 1)
            );
            components.push(joinRow);

            // Store the current page in the button collector
            const message = await interaction.editReply({
                embeds: [embeds[0]],
                components
            });

            if (embeds.length > 1) {
                const collector = message.createMessageComponentCollector({ time: 300000 }); // 5 minutes
                let currentPage = 0;

                collector.on('collect', async i => {
                    if (i.user.id !== interaction.user.id) {
                        await i.reply({ content: '❌ This is not your giveaway menu.', ephemeral: true });
                        return;
                    }

                    try {
                        if (i.customId === 'giveaway_prev' || i.customId === 'giveaway_next') {
                            // Handle navigation
                            if (i.customId === 'giveaway_prev') {
                                currentPage--;
                            } else {
                                currentPage++;
                            }

                            // Update navigation buttons
                            const navRow = ActionRowBuilder.from(components[0]);
                            navRow.components[0].setDisabled(currentPage === 0);
                            navRow.components[1].setDisabled(currentPage === embeds.length - 1);

                            // Update join button
                            const joinRow = ActionRowBuilder.from(components[1]);
                            joinRow.components[0].setCustomId(`giveaway_join_${giveaways[currentPage].giveawayID}`);

                            await i.update({
                                embeds: [embeds[currentPage]],
                                components: [navRow, joinRow]
                            });
                        } else if (i.customId.startsWith('giveaway_join_')) {
                            // Handle join button click
                            const giveawayId = parseInt(i.customId.split('_')[2]);
                            await this.handleJoinGiveaway(i, { database, giveawayId });
                        }
                    } catch (error) {
                        console.error('Error handling button:', error);
                        if (!i.replied && !i.deferred) {
                            await i.reply({ content: '❌ An error occurred. Please try again.', ephemeral: true });
                        }
                    }
                });

                collector.on('end', () => {
                    components.forEach(row => row.components.forEach(button => button.setDisabled(true)));
                    message.edit({ components });
                });
            }
        } catch (error) {
            console.error('Error in giveaway command:', error);
            await interaction.editReply({ content: '❌ Error showing giveaway.' });
        }
    },

    // Keep this for compatibility with gate.js
    async handleButton(interaction, { database }) {
        if (interaction.customId.startsWith('giveaway_join_')) {
            const giveawayId = parseInt(interaction.customId.split('_')[2]);
            await this.handleJoinGiveaway(interaction, { database, giveawayId });
        } else if (interaction.customId === 'giveaway_prev' || interaction.customId === 'giveaway_next') {
            // Navigation is handled by the collector in execute()
            return;
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
                await interaction.reply({ content: '❌ This giveaway is no longer active.', ephemeral: true });
                return;
            }

            const { mGateDB, mGiveawayDB } = database;
            
            const tickets = user?.currency?.[5] || 0;
            
            // Check if this is the user's first entry in this giveaway
            const userEntries = giveaway.entries?.filter(entry => entry.userID === interaction.user.id)?.length || 0;
            
            // Determine if entry is free based on the GIVEAWAY_FIRST_TICKET_FREE toggle
            const isFreeEntry = GIVEAWAY_FIRST_TICKET_FREE && userEntries === 0;

            // Check ticket requirement for paid entries
            if (!isFreeEntry && tickets < 1) {
                await interaction.reply({ content: '❌ You need at least 1 ticket to join!', ephemeral: true });
                return;
            }

            try {
                // Only consume ticket if it's a paid entry
                if (!isFreeEntry) {
                    const updateResult = await mGateDB.updateOne(
                        { 
                            userID: interaction.user.id,
                            'currency.5': { $gte: 1 } // Ensure user has enough tickets
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
                            entries: { userID: interaction.user.id },
                            logs: { 
                                userID: interaction.user.id, 
                                timestamp: new Date(), 
                                tickets: isFreeEntry ? 0 : 1,
                                freeEntry: isFreeEntry
                            }
                        }
                    }
                );

                // Get updated counts for response
                const updatedUser = await getGateUser(interaction.user.id);
                const finalGiveaway = await mGiveawayDB.findOne({ giveawayID: giveaway.giveawayID });
                const finalUserEntries = finalGiveaway.entries?.filter(entry => entry.userID === interaction.user.id)?.length || 0;
                const totalEntries = finalGiveaway.entries?.length || 0;

                // Ensure currency exists before accessing
                const remainingTickets = !isFreeEntry ? (updatedUser?.currency?.[5] || 0) : tickets;

                await interaction.reply({ 
                    content: `<@${interaction.user.id}> ${isFreeEntry ? 'got a free entry!' : 'joined the giveaway!'}\n` +
                        `🎫 Remaining Tickets: **${remainingTickets}**\n` +
                        `🎯 Your Entries: **${finalUserEntries}**\n` +
                        `👥 Total Entries: **${totalEntries}**`,
                    ephemeral: false
                });
            } catch (error) {
                console.error('Error in giveaway entry process:', error);
                throw error;
            }
        } catch (error) {
            console.error('Error in giveaway button handler:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ 
                    content: '❌ Error joining giveaway. Please try again in a few moments.',
                    ephemeral: true
                });
            }
        }
    }
};
