const { SlashCommandBuilder, EmbedBuilder, StringSelectMenuBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios = require('axios');

const MIMS_GUILD = '1240866080985976844';
const GIVEAWAY_CHANNEL = '1245303055004733460';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('Giveaway system commands')
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Create a new giveaway')
                .addStringOption(option =>
                    option.setName('item-id')
                        .setDescription('The ID of the item')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('level')
                        .setDescription('Giveaway level (0 or 1)')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Level 0', value: 0 },
                            { name: 'Level 1', value: 1 }
                        ))
                .addIntegerOption(option =>
                    option.setName('amount')
                        .setDescription('Amount of tickets needed')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all giveaways')
                .addBooleanOption(option =>
                    option.setName('active')
                        .setDescription('Filter by active status')))
        .addSubcommand(subcommand =>
            subcommand
                .setName('check')
                .setDescription('Check a specific giveaway')
                .addIntegerOption(option =>
                    option.setName('giveaway-id')
                        .setDescription('The ID of the giveaway')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('new-timestamp')
                        .setDescription('New timestamp for the giveaway (optional)'))),

    async execute(interaction, { database }) {
        // Only work in MIMS_GUILD
        if (interaction.guild.id !== MIMS_GUILD) {
            return interaction.reply({
                content: '❌ This command can only be used in MIMS Guild.',
                ephemeral: true
            });
        }

        const { mGiveawayDB } = database;
        const subcommand = interaction.options.getSubcommand();

        try {
            switch (subcommand) {
                case 'set': {
                    const itemId = interaction.options.getString('item-id');
                    const level = interaction.options.getInteger('level');
                    const amount = interaction.options.getInteger('amount');

                    // Validate level
                    if (level !== 0 && level !== 1) {
                        return interaction.reply({
                            content: '❌ Level must be either 0 or 1.',
                            ephemeral: true
                        });
                    }

                    try {
                        // Fetch item data from API
                        const { data: itemData } = await axios.get(`https://api.mazoku.cc/api/get-inventory-item-by-id/${itemId}`);
                        
                        // Create giveaway
                        const giveaway = await database.createGiveaway(
                            interaction.user.id,
                            itemId,
                            level,
                            amount
                        );

                        // Create embed for response
                        const embed = new EmbedBuilder()
                            .setColor('#0099ff')
                            .setTitle('🎉 New Giveaway Created!')
                            .addFields(
                                { name: 'Item', value: itemData.card.name },
                                { name: 'Series', value: itemData.card.series },
                                { name: 'Tier', value: itemData.card.tier },
                                { name: 'Level', value: level.toString() },
                                { name: 'Tickets Required', value: amount.toString() },
                                { name: 'Created By', value: `<@${interaction.user.id}>` }
                            )
                            .setImage(itemData.card.cardImageLink.replace('.png', ''))
                            .setTimestamp();

                        return interaction.reply({ embeds: [embed] });
                    } catch (error) {
                        if (error.response && error.response.status === 404) {
                            return interaction.reply({
                                content: '❌ Invalid item ID.',
                                ephemeral: true
                            });
                        }
                        throw error;
                    }
                }

                case 'list': {
                    const activeFilter = interaction.options.getBoolean('active');
                    const giveaways = await database.getGiveaways(activeFilter);

                    if (giveaways.length === 0) {
                        return interaction.reply({
                            content: '❌ No giveaways found.',
                            ephemeral: true
                        });
                    }

                    const embed = new EmbedBuilder()
                        .setColor('#0099ff')
                        .setTitle('🎉 Giveaway List')
                        .setDescription(`Showing ${activeFilter !== null ? (activeFilter ? 'active' : 'inactive') : 'all'} giveaways`);

                    for (const giveaway of giveaways) {
                        try {
                            const { data: itemData } = await axios.get(`https://api.mazoku.cc/api/get-inventory-item-by-id/${giveaway.itemID}`);

                            embed.addFields({
                                name: `Giveaway #${giveaway.giveawayID}`,
                                value: `Item: ${itemData.card.name}\nLevel: ${giveaway.level}\nTickets: ${giveaway.amount}\nStatus: ${giveaway.active ? '🟢 Active' : '🔴 Inactive'}`
                            });
                        } catch (error) {
                            console.error(`Error fetching item data for giveaway #${giveaway.giveawayID}:`, error);
                            embed.addFields({
                                name: `Giveaway #${giveaway.giveawayID}`,
                                value: `Item: Unknown\nLevel: ${giveaway.level}\nTickets: ${giveaway.amount}\nStatus: ${giveaway.active ? '🟢 Active' : '🔴 Inactive'}`
                            });
                        }
                    }

                    return interaction.reply({ embeds: [embed] });
                }

                case 'check': {
                    const giveawayId = interaction.options.getInteger('giveaway-id');
                    const newTimestamp = interaction.options.getString('new-timestamp');

                    const giveaway = await database.getGiveaway(giveawayId);
                    if (!giveaway) {
                        return interaction.reply({
                            content: '❌ Giveaway not found.',
                            ephemeral: true
                        });
                    }

                    if (newTimestamp) {
                        await database.updateGiveawayTimestamp(giveawayId, new Date(newTimestamp));
                    }

                    try {
                        const { data: itemData } = await axios.get(`https://api.mazoku.cc/api/get-inventory-item-by-id/${giveaway.itemID}`);

                        const embed = new EmbedBuilder()
                            .setColor('#0099ff')
                            .setTitle(`🎉 Giveaway #${giveaway.giveawayID}`)
                            .addFields(
                                { name: 'Item', value: itemData.card.name },
                                { name: 'Series', value: itemData.card.series },
                                { name: 'Tier', value: itemData.card.tier },
                                { name: 'Level', value: giveaway.level.toString() },
                                { name: 'Tickets Required', value: giveaway.amount.toString() },
                                { name: 'Status', value: giveaway.active ? '🟢 Active' : '🔴 Inactive' },
                                { name: 'Created By', value: `<@${giveaway.userID}>` },
                                { name: 'Created At', value: new Date(giveaway.timestamp).toLocaleString() },
                                { name: 'Total Entries', value: giveaway.users.length.toString() }
                            )
                            .setImage(itemData.card.cardImageLink.replace('.png', ''));

                        return interaction.reply({ embeds: [embed] });
                    } catch (error) {
                        if (error.response && error.response.status === 404) {
                            return interaction.reply({
                                content: '❌ Item data not found.',
                                ephemeral: true
                            });
                        }
                        throw error;
                    }
                }
            }
        } catch (error) {
            console.error('Error in giveaway command:', error);
            return interaction.reply({
                content: '❌ An error occurred while processing your request.',
                ephemeral: true
            });
        }
    }
};
