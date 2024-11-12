const { EmbedBuilder } = require('discord.js');
const axios = require('axios');
const { GATE_GUILD } = require('../utils/constants');

module.exports = {
    subcommand: subcommand =>
        subcommand
            .setName('giveaway')
            .setDescription('Show giveaway details and rewards'),

    async execute(interaction, { database }) {
        const { mGateServerDB } = database;
        const serverData = await mGiveawayDB.findOne({ serverID: GATE_GUILD });

        // Check for active giveaways
        if (!serverData.giveaway || serverData.giveaway.length === 0) {
            return interaction.reply({
                content: '❌ There are no active giveaways at the moment.',
                ephemeral: true
            });
        }

        // Get the current giveaway
        const currentGiveaway = serverData.giveaway[0];
        
        try {
            // Fetch card details from API using axios
            const response = await axios.get(`https://api.mazoku.cc/api/get-inventory-item-by-id/${currentGiveaway.itemId}`);
            const cardData = response.data;

            // Create embed
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('🎉 Current Giveaway')
                .setDescription(`**${cardData.card.name}**\nFrom: ${cardData.card.series}\nTier: ${cardData.card.tier}`)
                .setImage(cardData.card.cardImageLink);

            // Calculate time left
            const endTime = new Date(currentGiveaway.endTime);
            const timeStamp = Math.floor(endTime.getTime() / 1000);

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

            embed.addFields(
                { name: 'Time Left', value: `<t:${timeStamp}:R>`, inline: true },
                { name: 'Entries', value: `${currentGiveaway.entries || 0}`, inline: true },
                { name: 'Requirements', value: requirementText, inline: false }
            );

            return interaction.reply({
                embeds: [embed],
                ephemeral: true
            });
        } catch (error) {
            console.error('Error fetching card data:', error);
            return interaction.reply({
                content: '❌ Error fetching giveaway details.',
                ephemeral: true
            });
        }
    }
};
