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

            const giveaway = giveaways[0];

            // Get user's tickets
            const userTickets = user?.currency?.[5] || 0;

            // Get total entries
            const totalEntries = giveaway.entries?.length || 0;
            const userEntries = giveaway.entries?.filter(entry => entry.userID === interaction.user.id)?.length || 0;

            // Calculate chance of winning before buying another ticket
            const currentChanceOfWinning = ((userEntries / totalEntries) * 100).toFixed(2);

            // Calculate chance of winning if user buys another ticket
            const newTotalEntries = totalEntries + 1;
            const newUserEntries = userEntries + 1;
            const newChanceOfWinning = ((newUserEntries / newTotalEntries) * 100).toFixed(2);

            // Calculate percentage chance of improvement
            let chanceOfImprovement = ((newChanceOfWinning - currentChanceOfWinning) / currentChanceOfWinning * 100).toFixed(2);
            if (isNaN(chanceOfImprovement)) chanceOfImprovement = newChanceOfWinning; // if current chance of winning is 0

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
                const prizes = giveaway.item?.name?.split(' | ') || ['No Prizes Set'];
                description = `**Prizes:**\n${prizes.map((prize, i) => `${i + 1}. ${prize}`).join('\n')}\n\n` +
                            `**Message:** ${giveaway.item?.description || 'No Message Set'}`;
            }

            // Add statistics to description
            description += `\n\n🎫 Your Tickets: **${userTickets}**\n` +
                         `🎯 Your Entries: **${userEntries}**\n` +
                         `👥 Total Entries: **${totalEntries}**`;

            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('🎉 Current Giveaway')
                .setDescription(description)
                .setThumbnail(giveaway.item?.imageUrl || null)
                .addFields({
                    name: 'Time Remaining',
                    value: `⏰ Ends <t:${giveaway.endTimestamp}:R>`
                });

            // Adjust button based on giveaway level and user's tickets
            const button = new ButtonBuilder()
                .setCustomId('giveaway_join')
                .setLabel(
                    GIVEAWAY_FIRST_TICKET_FREE ? 
                    'Join Giveaway (1st Free)' : 
                    'Join Giveaway (1 Ticket)'
                )
                .setStyle(ButtonStyle.Primary)
                // Only disable if first ticket is not free and user has no tickets
                .setDisabled(!GIVEAWAY_FIRST_TICKET_FREE && userTickets < 1);

            const row = new ActionRowBuilder().addComponents(button);

            await interaction.editReply({
                embeds: [embed],
                components: [row]
            });
        } catch (error) {
            console.error('Error in giveaway command:', error);
            await interaction.editReply({ content: '❌ Error showing giveaway.' });
        }
    },

    async handleButton(interaction, { database }) {
        if (interaction.customId !== 'giveaway_join') {
            return;
        }

        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply({ ephemeral: true });
        }

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

            const giveaway = giveaways[0];
            const { mGateDB, mGiveawayDB } = database;
            
            const tickets = user?.currency?.[5] || 0;
            
            // Check if this is the user's first entry in this giveaway
            const updatedGiveaway = await mGiveawayDB.findOne({ giveawayID: giveaway.giveawayID });
            const userEntries = updatedGiveaway.entries?.filter(entry => entry.userID === interaction.user.id)?.length || 0;
            
            // Determine if entry is free based on the GIVEAWAY_FIRST_TICKET_FREE toggle
            const isFreeEntry = GIVEAWAY_FIRST_TICKET_FREE && userEntries === 0;

            // Check ticket requirement for paid entries
            if (!isFreeEntry && tickets < 1) {
                return interaction.editReply({ content: '❌ You need at least 1 ticket to join!' });
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

                await interaction.editReply({ 
                    content: `✅ ${isFreeEntry ? 'Free first entry!' : 'You joined the giveaway!'}\n` +
                        `🎫 Remaining Tickets: **${remainingTickets}**\n` +
                        `🎯 Your Entries: **${finalUserEntries}**\n` +
                        `👥 Total Entries: **${totalEntries}**`
                });
            } catch (error) {
                console.error('Error in giveaway entry process:', error);
                throw error;
            }
        } catch (error) {
            console.error('Error in giveaway button handler:', error);
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ 
                    content: '❌ Error joining giveaway. Please try again in a few moments.' 
                });
            } else {
                await interaction.reply({ 
                    content: '❌ Error joining giveaway. Please try again in a few moments.',
                    ephemeral: true
                });
            }
        }
    }
};
