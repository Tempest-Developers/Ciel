const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const getTierEmoji = require('../../../utility/getTierEmoji');

module.exports = {
    subcommand: subcommand =>
        subcommand
            .setName('giveaway')
            .setDescription('Show giveaway details and rewards'),

    async execute(interaction, { database }) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const giveaways = await database.getGiveaways(true);
            
            if (!giveaways || giveaways.length === 0) {
                return interaction.editReply({ content: '❌ No active giveaways.' });
            }

            const giveaway = giveaways[0];

            // Get user's tickets
            const user = await database.mGateDB.findOne({ userID: interaction.user.id });
            const userTickets = user?.currency?.[5] || 0;

            // Get total entries
            const totalEntries = giveaway.entries?.length || 0;
            const userEntries = giveaway.entries?.filter(entry => entry.userID === interaction.user.id)?.length || 0;

            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('🎉 Current Giveaway')
                .setDescription(`**Item:** ${giveaway.item.name}\n` +
                                 `**Description:** ${giveaway.item.description || 'N/A'}\n` +
                                 `🎫 Your Tickets: **${userTickets}**\n` +
                                 `🎯 Your Entries: **${userEntries}**\n` +
                                 `👥 Total Entries: **${totalEntries}**`)
                .setImage(giveaway.item.imageUrl || null)
                .addFields({
                    name: 'Time Remaining',
                    value: `⏰ Ends <t:${giveaway.endTimestamp}:R>`
                });

            // Adjust button based on giveaway level and user's tickets
            const button = new ButtonBuilder()
                .setCustomId('giveaway_join')
                .setLabel(giveaway.level === 2 ? 'Join Giveaway (1st Free)' : 'Join Giveaway (1 Ticket)')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(userTickets < 1);

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
            const giveaways = await database.getGiveaways(true);
            
            if (!giveaways || giveaways.length === 0) {
                return interaction.editReply({ content: '❌ No active giveaways.' });
            }

            const giveaway = giveaways[0];
            const { mGateDB, mGiveawayDB } = database;
            
            // Get user's tickets with fresh query
            const user = await mGateDB.findOne({ userID: interaction.user.id });
            const tickets = user?.currency?.[5] || 0;
            
            // Check if this is the user's first entry in this giveaway
            const updatedGiveaway = await mGiveawayDB.findOne({ giveawayID: giveaway.giveawayID });
            const userEntries = updatedGiveaway.entries?.filter(entry => entry.userID === interaction.user.id)?.length || 0;
            
            // Determine if entry is free (first entry for level 2 giveaway)
            const isFreeEntry = giveaway.level === 2 && userEntries === 0;

            // Check ticket requirement
            if (!isFreeEntry && tickets < 1) {
                return interaction.editReply({ content: '❌ You need at least 1 ticket to join!' });
            }

            try {
                // Update user's tickets only if not a free entry
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
                const updatedUser = await mGateDB.findOne({ userID: interaction.user.id });
                const finalGiveaway = await mGiveawayDB.findOne({ giveawayID: giveaway.giveawayID });
                const finalUserEntries = finalGiveaway.entries?.filter(entry => entry.userID === interaction.user.id)?.length || 0;
                const totalEntries = finalGiveaway.entries?.length || 0;

                await interaction.editReply({ 
                    content: `✅ ${isFreeEntry ? 'Free first entry for Level 2 Giveaway!' : 'You joined the giveaway!'}\n` +
                        `🎫 Remaining Tickets: **${updatedUser.currency[5]}**\n` +
                        `🎯 Your Entries: **${finalUserEntries}**\n` +
                        `👥 Total Entries: **${totalEntries}**`
                });
            } catch (error) {
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
