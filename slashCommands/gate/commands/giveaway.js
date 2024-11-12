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
            const { mGiveawayDB, mGateDB } = database;
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
            
            // Get user's ticket count
            const userData = await mGateDB.findOne({ userID: interaction.user.id });
            const userTickets = userData?.currency[5] || 0;
            
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
            const userEntries = userJoined ? 
                currentGiveaway.users.find(user => user.userID === interaction.user.id).amount_tickets : 
                0;

            embed.addFields(
                {
                    name: 'Giveaway Details', 
                    value: `**Time Remaining**: <t:${timeStamp}:R>\n**Total Entries**: ${totalEntries}\n**Your Entries**: ${userEntries}\n**Your Available Tickets**: ${userTickets}`
                }
            );

            // Create join button
            const joinButton = new ButtonBuilder()
                .setCustomId('giveaway_join')
                .setLabel(userJoined ? 'Already Joined' : 'Join Giveaway')
                .setStyle(userJoined ? ButtonStyle.Secondary : ButtonStyle.Primary)
                .setDisabled(userJoined || userTickets === 0);

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

                // Get user's ticket count
                const userData = await database.mGateDB.findOne({ userID: interaction.user.id });
                const userTickets = userData?.currency[5] || 0;

                if (userTickets === 0) {
                    return interaction.editReply({
                        content: '❌ You don\'t have any tickets! Use `/gate buy ticket` to purchase tickets.',
                        components: []
                    });
                }

                // Create ticket amount buttons
                const oneTicketBtn = new ButtonBuilder()
                    .setCustomId('giveaway_1_ticket')
                    .setLabel('1 Ticket')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(userTickets < 1);

                const fiveTicketBtn = new ButtonBuilder()
                    .setCustomId('giveaway_5_tickets')
                    .setLabel('5 Tickets')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(userTickets < 5);

                const allTicketsBtn = new ButtonBuilder()
                    .setCustomId('giveaway_all_tickets')
                    .setLabel(`All Tickets (${userTickets})`)
                    .setStyle(ButtonStyle.Primary);

                const cancelButton = new ButtonBuilder()
                    .setCustomId('giveaway_cancel')
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Secondary);

                const row = new ActionRowBuilder()
                    .addComponents(oneTicketBtn, fiveTicketBtn, allTicketsBtn, cancelButton);

                await interaction.editReply({
                    content: `You have ${userTickets} tickets. How many would you like to use?`,
                    components: [row]
                });
                return;
            }

            if (customId.startsWith('giveaway_') && customId !== 'giveaway_cancel') {
                await interaction.deferReply({ ephemeral: true });
                
                const giveaway = await database.mGiveawayDB.findOne({ active: true });
                if (!giveaway) {
                    return interaction.editReply({
                        content: '❌ This giveaway is no longer active.',
                        components: []
                    });
                }

                let ticketAmount;
                if (customId === 'giveaway_1_ticket') ticketAmount = 1;
                else if (customId === 'giveaway_5_tickets') ticketAmount = 5;
                else if (customId === 'giveaway_all_tickets') {
                    const userData = await database.mGateDB.findOne({ userID: interaction.user.id });
                    ticketAmount = userData?.currency[5] || 0;
                }

                try {
                    await database.joinGiveaway(giveaway.giveawayID, interaction.user.id, ticketAmount);
                    return interaction.editReply({
                        content: `✅ Successfully joined the giveaway with ${ticketAmount} ticket${ticketAmount > 1 ? 's' : ''}!`,
                        components: []
                    });
                } catch (error) {
                    let errorMessage = '❌ Failed to join giveaway.';
                    if (error.message === 'Not enough tickets') {
                        errorMessage = '❌ You don\'t have enough tickets!';
                    } else if (error.message === 'User has already joined this giveaway') {
                        errorMessage = '❌ You have already joined this giveaway!';
                    } else if (error.message === 'Giveaway not found or not active') {
                        errorMessage = '❌ This giveaway is no longer active.';
                    }
                    return interaction.editReply({
                        content: errorMessage,
                        components: []
                    });
                }
            }

            if (customId === 'giveaway_cancel') {
                await interaction.update({
                    content: '❌ Cancelled joining the giveaway.',
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
