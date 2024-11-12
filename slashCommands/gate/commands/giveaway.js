const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios = require('axios');
const { GATE_GUILD } = require('../utils/constants');
const getTierEmoji = require('../../../utility/getTierEmoji');

module.exports = {
    subcommand: subcommand =>
        subcommand
            .setName('giveaway')
            .setDescription('Show giveaway details and rewards'),

    async execute(interaction, { database }) {
        try {
            const { mGiveawayDB } = database;
            const serverData = await mGiveawayDB.find({ active: true }).toArray();

            // Check for active giveaways
            if (!serverData || serverData.length === 0) {
                return interaction.reply({
                    content: '❌ There are no active giveaways at the moment.',
                    ephemeral: true
                });
            }

            // Get the current giveaway
            const currentGiveaway = serverData[0];
            
            // Fetch card details from API using axios
            const response = await axios.get(`https://api.mazoku.cc/api/get-inventory-item-by-id/${currentGiveaway.itemID}`);
            const cardData = response.data;

            // Create embed
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('🎉 Current Giveaway')
                .setDescription(`${getTierEmoji(cardData.card.tier+"T")}** ${cardData.card.name}** #**${cardData.version}**\n *${cardData.card.series}*`)
                .setImage(cardData.card.cardImageLink.replace('.png', ''));

            // Calculate time left
            const timeStamp = currentGiveaway.endTimestamp;

            // Check if user has already joined
            const userJoined = currentGiveaway.users?.some(user => user.userID === interaction.user.id);
            const totalEntries = currentGiveaway.users?.reduce((sum, user) => sum + user.amount_tickets, 0) || 0;

            embed.addFields(
                {
                    name: 'Giveaway Details', 
                    value: `**Time Remaining**: <t:${timeStamp}:R>\n**Entries**: ${totalEntries}`
                }
            );

            // Create join button
            const joinButton = new ButtonBuilder()
                .setCustomId('giveaway_join')
                .setLabel(userJoined ? 'Already Joined' : 'Join Giveaway')
                .setStyle(userJoined ? ButtonStyle.Secondary : ButtonStyle.Primary)
                .setDisabled(userJoined);

            const row = new ActionRowBuilder()
                .addComponents(joinButton);

            await interaction.reply({
                embeds: [embed],
                components: [row],
                ephemeral: true
            });
        } catch (error) {
            console.error('Error in giveaway command:', error);
            if (!interaction.replied) {
                await interaction.reply({
                    content: '❌ Error fetching giveaway details.',
                    ephemeral: true
                });
            }
        }
    },

    async handleButton(interaction, { database }) {
        if (!interaction.isButton()) return;

        try {
            const customId = interaction.customId;

            if (customId === 'giveaway_join') {
                await interaction.deferReply({ ephemeral: true });
                
                const giveaway = await database.mGiveawayDB.findOne({ active: true });
                
                if (!giveaway) {
                    return interaction.editReply({
                        content: '❌ This giveaway is no longer active.',
                        components: []
                    });
                }

                // Check if user already joined
                if (giveaway.users?.some(user => user.userID === interaction.user.id)) {
                    return interaction.editReply({
                        content: '❌ You have already joined this giveaway!',
                        components: []
                    });
                }

                // Create confirm button
                const confirmButton = new ButtonBuilder()
                    .setCustomId('giveaway_confirm')
                    .setLabel('Confirm Join')
                    .setStyle(ButtonStyle.Success);

                const cancelButton = new ButtonBuilder()
                    .setCustomId('giveaway_cancel')
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Danger);

                const row = new ActionRowBuilder()
                    .addComponents(confirmButton, cancelButton);

                await interaction.editReply({
                    content: 'Are you sure you want to join this giveaway?',
                    components: [row]
                });
                return;
            }

            if (customId === 'giveaway_confirm') {
                await interaction.deferReply({ ephemeral: true });
                
                const giveaway = await database.mGiveawayDB.findOne({ active: true });
                
                if (!giveaway) {
                    return interaction.editReply({
                        content: '❌ This giveaway is no longer active.',
                        components: []
                    });
                }

                try {
                    await database.joinGiveaway(giveaway.giveawayID, interaction.user.id, 1);
                    return interaction.editReply({
                        content: '✅ You have successfully joined the giveaway!',
                        components: []
                    });
                } catch (error) {
                    if (error.message === 'User has already joined this giveaway') {
                        return interaction.editReply({
                            content: '❌ You have already joined this giveaway!',
                            components: []
                        });
                    }
                    if (error.message === 'Giveaway not found or not active') {
                        return interaction.editReply({
                            content: '❌ This giveaway is no longer active.',
                            components: []
                        });
                    }
                    throw error;
                }
            }

            if (customId === 'giveaway_cancel') {
                await interaction.deferReply({ ephemeral: true });
                return interaction.editReply({
                    content: '❌ Giveaway join cancelled.',
                    components: []
                });
            }
        } catch (error) {
            console.error('Error handling button:', error);
            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: '❌ An error occurred while processing your request.',
                        ephemeral: true
                    });
                } else {
                    await interaction.editReply({
                        content: '❌ An error occurred while processing your request.',
                        components: []
                    });
                }
            } catch (replyError) {
                console.error('Error sending error message:', replyError);
            }
        }
    }
};
