const { EmbedBuilder } = require('discord.js');
const axios = require('axios');

let lastCheck = 0;
const CHECK_INTERVAL = 60000; // 1 minute in milliseconds
const GIVEAWAY_CHANNEL = '1245303280599433256';

module.exports = {
    name: 'messageCreate',
    async execute(message, { database }) {
        // Skip if no database
        if (!database || !database.mGiveawayDB) {
            console.error('Database or mGiveawayDB not available');
            return;
        }

        const now = Date.now();
        if (now - lastCheck < CHECK_INTERVAL) {
            return;
        }
        lastCheck = now;

        try {
            // Find active giveaways that have ended
            const endedGiveaways = await database.mGiveawayDB.find({
                active: true,
                timestamp: { $lt: new Date() }
            }).toArray();

            for (const giveaway of endedGiveaways) {
                // Skip if no participants
                if (!giveaway.users || giveaway.users.length === 0) {
                    await database.mGiveawayDB.updateOne(
                        { giveawayID: giveaway.giveawayID },
                        { $set: { active: false } }
                    );
                    continue;
                }

                // Create array of tickets for random selection
                let tickets = [];
                for (const user of giveaway.users) {
                    for (let i = 0; i < user.amount_tickets; i++) {
                        tickets.push(user.userID);
                    }
                }

                // Randomly select winner
                const winnerID = tickets[Math.floor(Math.random() * tickets.length)];
                
                try {
                    // Get item details from API
                    const { data: itemData } = await axios.get(`https://api.mazoku.cc/api/get-inventory-item-by-id/${giveaway.itemID}`);

                    // Create winner announcement embed
                    const embed = new EmbedBuilder()
                        .setColor('#00ff00')
                        .setTitle('🎉 Giveaway Winner!')
                        .addFields(
                            { name: 'Item', value: itemData.card.name },
                            { name: 'Series', value: itemData.card.series },
                            { name: 'Tier', value: itemData.card.tier },
                            { name: 'Winner', value: `<@${winnerID}>` },
                            { name: 'Total Entries', value: tickets.length.toString() }
                        )
                        .setImage(itemData.card.cardImageLink.replace('.png', ''))
                        .setTimestamp();

                    // Add maker information
                    if (itemData.card.makers && itemData.card.makers.length > 0) {
                        const makers = itemData.card.makers.map(id => `<@${id}>`).join(', ');
                        embed.addFields({ name: 'Makers', value: makers });
                    }

                    // Add event type if exists
                    if (itemData.card.eventType) {
                        embed.addFields({ name: 'Event', value: '🎃' });
                    }

                    // Send winner announcement
                    const channel = await message.client.channels.fetch(GIVEAWAY_CHANNEL);
                    await channel.send({ embeds: [embed] });

                    // Mark giveaway as inactive
                    await database.mGiveawayDB.updateOne(
                        { giveawayID: giveaway.giveawayID },
                        { $set: { active: false } }
                    );
                } catch (error) {
                    console.error('Error fetching item data:', error);
                    // Still mark giveaway as inactive even if API call fails
                    await database.mGiveawayDB.updateOne(
                        { giveawayID: giveaway.giveawayID },
                        { $set: { active: false } }
                    );
                }
            }
        } catch (error) {
            console.error('Error checking giveaways:', error);
        }
    },
};
