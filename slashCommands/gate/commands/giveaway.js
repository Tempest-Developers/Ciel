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
        const { mGiveawayDB } = database;
        const serverData = await mGiveawayDB.find().toArray();

        // Check for active giveaways
        if (!serverData || serverData.length === 0) {
            return interaction.reply({
                content: '❌ There are no active giveaways at the moment.',
                ephemeral: true
            });
        }

        // Get the current giveaway
        const currentGiveaway = serverData[0];
        
        try {
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

            // Add giveaway details
            let requirementText = 'No requirements';
            if (currentGiveaway.level > 0 || currentGiveaway.amount > 0) {
                if (currentGiveaway.level > 0) {
                    requirementText = `Level ${currentGiveaway.level} required`;
                }
                if (currentGiveaway.amount > 0) {
                    requirementText += `${currentGiveaway.level > 0 ? ' and ' : ''}${currentGiveaway.amount} tickets required`;
                }
            }

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
                .setCustomId('join_giveaway')
                .setLabel(userJoined ? 'Already Joined' : 'Join Giveaway')
                .setStyle(userJoined ? ButtonStyle.Secondary : ButtonStyle.Primary)
                .setDisabled(userJoined);

            const row = new ActionRowBuilder()
                .addComponents(joinButton);

            return interaction.reply({
                embeds: [embed],
                components: [row],
                ephemeral: true
            });
        } catch (error) {
            console.error('Error fetching card data:', error);
            return interaction.reply({
                content: '❌ Error fetching giveaway details.',
                ephemeral: true
            });
        }
    },

    async handleButton(interaction, { database }) {
        if (interaction.customId === 'join_giveaway') {
            try {
                const giveaway = await database.mGiveawayDB.findOne({ active: true });
                
                if (!giveaway) {
                    return interaction.reply({
                        content: '❌ This giveaway is no longer active.',
                        ephemeral: true
                    });
                }

                // Check if user already joined
                if (giveaway.users?.some(user => user.userID === interaction.user.id)) {
                    return interaction.reply({
                        content: '❌ You have already joined this giveaway!',
                        ephemeral: true
                    });
                }

                // Create confirm button
                const confirmButton = new ButtonBuilder()
                    .setCustomId('confirm_join')
                    .setLabel('Confirm Join')
                    .setStyle(ButtonStyle.Success);

                const cancelButton = new ButtonBuilder()
                    .setCustomId('cancel_join')
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Danger);

                const row = new ActionRowBuilder()
                    .addComponents(confirmButton, cancelButton);

                // Show confirmation message
                return interaction.reply({
                    content: 'Are you sure you want to join this giveaway?',
                    components: [row],
                    ephemeral: true
                });
            } catch (error) {
                console.error('Error handling join button:', error);
                return interaction.reply({
                    content: '❌ An error occurred while joining the giveaway.',
                    ephemeral: true
                });
            }
        }

        if (interaction.customId === 'confirm_join') {
            try {
                const giveaway = await database.mGiveawayDB.findOne({ active: true });
                
                if (!giveaway) {
                    return interaction.reply({
                        content: '❌ This giveaway is no longer active.',
                        ephemeral: true
                    });
                }

                // Add user to giveaway using the database helper function
                await database.joinGiveaway(giveaway.giveawayID, interaction.user.id, 1);

                return interaction.reply({
                    content: '✅ You have successfully joined the giveaway!',
                    ephemeral: true
                });
            } catch (error) {
                console.error('Error confirming join:', error);
                return interaction.reply({
                    content: '❌ An error occurred while joining the giveaway.',
                    ephemeral: true
                });
            }
        }

        if (interaction.customId === 'cancel_join') {
            return interaction.reply({
                content: '❌ Giveaway join cancelled.',
                ephemeral: true
            });
        }
    }
};
