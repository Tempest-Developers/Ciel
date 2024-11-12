const { EmbedBuilder } = require('discord.js');
const handleCreateMazokuMessage = require('../utility/handleCreateMazokuMessage');
const axios = require('axios');
require('dotenv').config();
const config = require('../config.json');

let lastCheck = 0;
const CHECK_INTERVAL = 60000; // 1 minute in milliseconds
const GUILD_CHANNELS = {
    '1240866080985976844': '1245303280599433256' // Map of guild ID to channel ID
};

module.exports = {
    name: 'messageCreate',
    async execute(message, { database }) {
        // Skip if no database
        if (!database || !database.mGiveawayDB) {
            console.error('Database or mGiveawayDB not available');
            return;
        }

        // Handle Mazoku messages immediately without rate limiting
        if (message.author.id === config.mazokuID) {
            await handleCreateMazokuMessage(message, config.mazokuID, database);
            return;
        }

        // Rate limit check for giveaway processing only
        const now = Math.floor(Date.now() / 1000); // Convert to unix timestamp
        if (now - lastCheck < CHECK_INTERVAL / 1000) {
            return;
        }
        lastCheck = now;

        try {
            // Find active giveaways that have ended
            const endedGiveaways = await database.mGiveawayDB.find({
                active: true,
                endTimestamp: { $lt: now }
            }).toArray();

            for (const giveaway of endedGiveaways) {
                try {
                    // Get item details from API first so we have it for both cases
                    const { data: itemData } = await axios.get(`https://api.mazoku.cc/api/get-inventory-item-by-id/${giveaway.itemID}`);

                    // Handle case with no participants
                    if (!giveaway.users || giveaway.users.length === 0) {
                        const noWinnerEmbed = new EmbedBuilder()
                            .setColor('#ff0000')
                            .setTitle('🎉 Giveaway Ended - No Winners')
                            .addFields(
                                { name: 'Item', value: itemData.card.name },
                                { name: 'Series', value: itemData.card.series },
                                { name: 'Tier', value: itemData.card.tier },
                                { name: 'Result', value: 'No participants joined this giveaway.' }
                            )
                            .setImage(itemData.card.cardImageLink.replace('.png', ''))
                            .setTimestamp();

                        // Add maker information
                        if (itemData.card.makers && itemData.card.makers.length > 0) {
                            const makers = itemData.card.makers.map(id => `<@${id}>`).join(', ');
                            noWinnerEmbed.addFields({ name: 'Makers', value: makers });
                        }

                        // Add event type if exists
                        if (itemData.card.eventType) {
                            noWinnerEmbed.addFields({ name: 'Event', value: '🎃' });
                        }

                        // Send no winner announcement to appropriate guild channels
                        for (const [guildId, channelId] of Object.entries(GUILD_CHANNELS)) {
                            try {
                                const guild = await message.client.guilds.fetch(guildId);
                                if (guild) {
                                    const channel = await guild.channels.fetch(channelId);
                                    if (channel) {
                                        await channel.send({ embeds: [noWinnerEmbed] });
                                    }
                                }
                            } catch (err) {
                                console.error(`Error sending to guild ${guildId}:`, err);
                            }
                        }

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

                    // Send winner announcement to appropriate guild channels
                    for (const [guildId, channelId] of Object.entries(GUILD_CHANNELS)) {
                        try {
                            const guild = await message.client.guilds.fetch(guildId);
                            if (guild) {
                                const channel = await guild.channels.fetch(channelId);
                                if (channel) {
                                    await channel.send({ embeds: [embed] });
                                }
                            }
                        } catch (err) {
                            console.error(`Error sending to guild ${guildId}:`, err);
                        }
                    }

                    // Mark giveaway as inactive and store winner
                    await database.mGiveawayDB.updateOne(
                        { giveawayID: giveaway.giveawayID },
                        { 
                            $set: { 
                                active: false,
                                winner: {
                                    userID: winnerID,
                                    timestamp: now
                                }
                            }
                        }
                    );
                } catch (error) {
                    console.error('Error processing giveaway:', error);
                    // Still mark giveaway as inactive even if processing fails
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
