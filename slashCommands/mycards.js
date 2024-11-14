const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ComponentType } = require('discord.js');
const axios = require('axios');
const db = require('../database/mongo');
const getTierEmoji = require('../utility/getTierEmoji');

// Constants
const COOLDOWN_DURATION = 10000;
const CARDS_PER_PAGE = 10;
const INTERACTION_TIMEOUT = 900000; // 15 minutes
const API_URL = 'https://api.mazoku.cc/api/get-inventory-items/';
const MAX_RETRIES = 4;
const RETRY_DELAY = 1000;

// Function to create axios config with content length
const createAxiosConfig = (body) => ({
    headers: {
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
        'Host': 'api.mazoku.cc',
        'Content-Length': Buffer.byteLength(JSON.stringify(body))
    },
    timeout: 10000 // 10 second timeout
});

// Base request body
const createBaseRequestBody = (userId) => ({
    page: 1,
    pageSize: CARDS_PER_PAGE,
    name: "",
    type: "Card",
    seriesName: "",
    minVersion: 0,
    maxVersion: 1000,
    sortBy: "dateAdded",
    sortOrder: "desc",
    owner: userId
});

// Cooldown management with Map to prevent memory leaks
const cooldowns = new Map();

const versionRanges = {
    'SP': { min: 0, max: 10 },
    'LP': { min: 0, max: 100 },
    'MP': { min: 0, max: 499 },
    'HP': { min: 0, max: 1000 }
};

// Convert tier to format expected by getTierEmoji
const formatTier = (tier) => `${tier}T`;

// Utility function for delayed execution
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Retry mechanism for API calls
const retryOperation = async (operation, maxRetries = MAX_RETRIES) => {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await operation();
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            await delay(RETRY_DELAY * Math.pow(2, i));
        }
    }
};

const createCardListEmbed = async (cards, page, totalPages, userId) => {
    try {
        const embed = new EmbedBuilder()
            .setTitle('Your Card Collection')
            .setColor('#0099ff');

        let description = `Page ${page} of ${totalPages}\n\n`;
        
        if (!Array.isArray(cards) || cards.length === 0) {
            description += 'No cards found.';
        } else {
            // Get all card IDs for bulk wishlist count fetch
            const cardIds = cards.map(item => item.card.id);
            
            // Fetch wishlist counts and wishlist status for all cards at once
            const [wishlistCounts, userWishlistStatus] = await Promise.all([
                db.getCardWishlistCount(cardIds),
                Promise.all(cards.map(item => db.isInWishlist(userId, item.card.id)))
            ]);

            // Create the description with all card information
            cards.forEach((item, index) => {
                if (!item || !item.card) return;
                const card = item.card;
                const tierEmoji = getTierEmoji(formatTier(card.tier));
                const eventEmoji = card.eventType ? '🎃' : '';
                const wishlistCount = wishlistCounts.get(card.id) || 0;
                const isWishlisted = userWishlistStatus[index];
                const heartEmoji = isWishlisted ? ':yellow_heart:' : '❤️';
                description += `${tierEmoji} #${item.version} **${card.name}** ${eventEmoji}*${card.series}* ${heartEmoji} (${wishlistCount} ${heartEmoji})\n`;
            });
        }

        embed.setDescription(description);
        return embed;
    } catch (error) {
        console.error('Error creating card list embed:', error);
        return new EmbedBuilder()
            .setTitle('Error')
            .setDescription('An error occurred while creating the card list.')
            .setColor('#ff0000');
    }
};

const createCardDetailEmbed = async (item, userId) => {
    try {
        if (!item || !item.card) {
            throw new Error('Invalid card data');
        }

        const card = item.card;
        const isWishlisted = await db.isInWishlist(userId, card.id);
        const heartEmoji = isWishlisted ? '❤️' : '';

        const embed = new EmbedBuilder()
            .setTitle(`${getTierEmoji(formatTier(card.tier))} ${card.name} #${item.version} ${card.eventType ? '🎃' : ''} ${heartEmoji}`)
            .setDescription(`[${card.id}](https://mazoku.cc/card/${card.id})\n*${card.series}*`)
            .setImage(`https://cdn.mazoku.cc/packs/${card.id}`)
            .setColor('#0099ff');

        const [owners, wishlistCount] = await Promise.all([
            retryOperation(async () => {
                const response = await axios.get(
                    `https://api.mazoku.cc/api/get-inventory-items-by-card/${card.id}`,
                    {
                        headers: {
                            'Cache-Control': 'no-cache',
                            'Content-Type': 'application/json',
                            'Host': 'api.mazoku.cc'
                        },
                        timeout: 10000
                    }
                );
                return response.data;
            }),
            db.getCardWishlistCount(card.id)
        ]);

        if (Array.isArray(owners) && owners.length > 0) {
            const totalCopies = owners.length;
            const uniqueOwners = new Set(owners.map(o => o.owner)).size;
            const lowestPrint = Math.min(...owners.map(o => o.version).filter(v => v > 0));

            embed.addFields(
                { 
                    name: 'Global Card Details:', 
                    value: `**Prints Out** *${totalCopies.toString()}*\n**All Owners** *${uniqueOwners.toString()}*\n**Lowest Print** *#**${lowestPrint.toString()}***\n**Wishlist Count** *${wishlistCount}* ❤️`
                }
            );
        }

        return embed;
    } catch (error) {
        console.error('Error creating card detail embed:', error);
        return new EmbedBuilder()
            .setTitle('Error')
            .setDescription('An error occurred while fetching card details.')
            .setColor('#ff0000');
    }
};

const createNavigationButtons = (currentPage, totalPages) => {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('first')
                .setLabel('<<')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(currentPage === 1),
            new ButtonBuilder()
                .setCustomId('prev')
                .setLabel('<')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(currentPage === 1),
            new ButtonBuilder()
                .setCustomId('next')
                .setLabel('>')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(currentPage === totalPages),
            new ButtonBuilder()
                .setCustomId('last')
                .setLabel('>>')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(currentPage === totalPages)
        );
};

const createCardSelectMenu = (cards) => {
    try {
        if (!Array.isArray(cards) || cards.length === 0) {
            throw new Error('No cards available for select menu');
        }

        return new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('cardSelect')
                    .setPlaceholder('Select a card to view details')
                    .addOptions(
                        cards.map(item => ({
                            label: `${item.card.name} #${item.version}`,
                            description: item.card.series.substring(0, 100),
                            value: item.id.toString()
                        }))
                    )
            );
    } catch (error) {
        console.error('Error creating card select menu:', error);
        return null;
    }
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mycards')
        .setDescription('View and manage your card collection')
        .addStringOption(option =>
            option.setName('name')
                .setDescription('Filter cards by name'))
        .addStringOption(option =>
            option.setName('anime')
                .setDescription('Filter cards by anime series'))
        .addStringOption(option =>
            option.setName('tier')
                .setDescription('Filter cards by tier')
                .addChoices(
                    { name: 'C', value: 'C' },
                    { name: 'R', value: 'R' },
                    { name: 'SR', value: 'SR' },
                    { name: 'SSR', value: 'SSR' },
                    { name: 'UR', value: 'UR' }
                ))
        .addStringOption(option =>
            option.setName('version')
                .setDescription('Filter cards by version range')
                .addChoices(
                    { name: 'SP (1-10)', value: 'SP' },
                    { name: 'LP (1-100)', value: 'LP' },
                    { name: 'MP (1-499)', value: 'MP' },
                    { name: 'HP (1-1000)', value: 'HP' }
                ))
        .addStringOption(option =>
            option.setName('sort_by')
                .setDescription('Sort cards by')
                .addChoices(
                    { name: 'Date Added', value: 'dateAdded' },
                    { name: 'Name', value: 'name' }
                ))
        .addStringOption(option =>
            option.setName('sort_order')
                .setDescription('Sort order')
                .addChoices(
                    { name: 'Ascending', value: 'asc' },
                    { name: 'Descending', value: 'desc' }
                ))
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Filter by card type')
                .addChoices(
                    { name: 'Event', value: 'event' },
                    { name: 'Normal', value: 'normal' }
                )),

    async execute(interaction) {
        if (!interaction.isCommand()) return;

        try {
            // Guard against non-guild usage
            if (!interaction.guild) {
                await interaction.reply({
                    content: 'This command can only be used in a server.',
                    ephemeral: true
                });
                return;
            }

            // Cooldown check with proper cleanup
            if (cooldowns.has(interaction.user.id)) {
                const timeLeft = (cooldowns.get(interaction.user.id) - Date.now()) / 1000;
                if (timeLeft > 0) {
                    await interaction.reply({
                        content: `Please wait ${timeLeft.toFixed(1)} seconds before using this command again.`,
                        ephemeral: true
                    });
                    return;
                }
            }

            cooldowns.set(interaction.user.id, Date.now() + COOLDOWN_DURATION);
            setTimeout(() => cooldowns.delete(interaction.user.id), COOLDOWN_DURATION);

            await interaction.deferReply();

            let requestBody = createBaseRequestBody(interaction.user.id);
            let currentCards = [];

            // Handle options with validation
            const name = interaction.options.getString('name');
            const anime = interaction.options.getString('anime');
            const tier = interaction.options.getString('tier');
            const version = interaction.options.getString('version');
            const sortBy = interaction.options.getString('sort_by');
            const sortOrder = interaction.options.getString('sort_order');
            const type = interaction.options.getString('type');

            if (name?.trim()) requestBody.name = name.trim();
            if (anime?.trim()) requestBody.seriesName = anime.trim();
            if (tier) requestBody.tiers = [tier];
            if (version) {
                const range = versionRanges[version];
                if (range) {
                    requestBody.minVersion = range.min;
                    requestBody.maxVersion = range.max;
                }
            }
            if (sortBy) requestBody.sortBy = sortBy;
            if (sortOrder) requestBody.sortOrder = sortOrder;
            if (type) requestBody.eventType = type === 'event';

            try {
                // Use retry mechanism for API call
                const response = await retryOperation(async () => {
                    return await axios.post(API_URL, requestBody, createAxiosConfig(requestBody));
                });
                
                currentCards = response.data.cards || [];
                const totalPages = response.data.pageCount || 1;

                if (currentCards.length === 0) {
                    await interaction.editReply('No cards found matching your criteria.');
                    return;
                }

                let currentPage = 1;
                const embed = await createCardListEmbed(currentCards, currentPage, totalPages, interaction.user.id);
                const navigationButtons = createNavigationButtons(currentPage, totalPages);
                const selectMenu = createCardSelectMenu(currentCards);

                if (!selectMenu) {
                    await interaction.editReply({
                        content: 'An error occurred while creating the card selection menu.',
                        embeds: [embed],
                        components: [navigationButtons]
                    });
                    return;
                }

                const components = [navigationButtons, selectMenu];

                const reply = await interaction.editReply({
                    embeds: [embed],
                    components
                });

                const collector = reply.createMessageComponentCollector({
                    time: INTERACTION_TIMEOUT
                });

                collector.on('collect', async i => {
                    try {
                        if (i.user.id !== interaction.user.id) {
                            await i.reply({
                                content: 'You cannot use these controls.',
                                ephemeral: true
                            });
                            return;
                        }

                        await i.deferUpdate();

                        if (i.isButton()) {
                            if (i.customId === 'wishlist') {
                                const cardId = i.message.embeds[0].description.split('\n')[0].split('[')[1].split(']')[0];
                                const isCurrentlyWishlisted = await db.isInWishlist(i.user.id, cardId);
                                
                                let success;
                                if (isCurrentlyWishlisted) {
                                    success = await db.removeFromWishlist(i.user.id, cardId);
                                } else {
                                    success = await db.addToWishlist(i.user.id, cardId);
                                }

                                if (!success) {
                                    await i.followUp({
                                        content: 'Failed to update wishlist. Please try again.',
                                        ephemeral: true
                                    });
                                    return;
                                }

                                const wishlistButton = new ButtonBuilder()
                                    .setCustomId('wishlist')
                                    .setEmoji(isCurrentlyWishlisted ? '❤️' : '❎')
                                    .setStyle(isCurrentlyWishlisted ? ButtonStyle.Success : ButtonStyle.Danger);

                                const backButton = new ButtonBuilder()
                                    .setCustomId('back')
                                    .setLabel('Back to List')
                                    .setStyle(ButtonStyle.Secondary);

                                const actionRow = new ActionRowBuilder()
                                    .addComponents(wishlistButton, backButton);

                                // Update the embed to show new wishlist count
                                const selectedCard = currentCards.find(c => c.card.id === cardId);
                                if (selectedCard) {
                                    const updatedEmbed = await createCardDetailEmbed(selectedCard, i.user.id);
                                    await i.editReply({
                                        embeds: [updatedEmbed],
                                        components: [actionRow]
                                    });
                                } else {
                                    await i.editReply({ components: [actionRow] });
                                }
                            } else if (i.customId === 'back') {
                                const newEmbed = await createCardListEmbed(currentCards, currentPage, totalPages, i.user.id);
                                const newComponents = [
                                    createNavigationButtons(currentPage, totalPages),
                                    createCardSelectMenu(currentCards)
                                ].filter(Boolean);

                                await i.editReply({
                                    embeds: [newEmbed],
                                    components: newComponents
                                });
                            } else {
                                let newPage = currentPage;
                                switch (i.customId) {
                                    case 'first': newPage = 1; break;
                                    case 'prev': newPage = Math.max(1, currentPage - 1); break;
                                    case 'next': newPage = Math.min(totalPages, currentPage + 1); break;
                                    case 'last': newPage = totalPages; break;
                                }

                                if (newPage !== currentPage) {
                                    currentPage = newPage;
                                    requestBody.page = currentPage;

                                    const newResponse = await retryOperation(async () => {
                                        return await axios.post(API_URL, requestBody, createAxiosConfig(requestBody));
                                    });

                                    currentCards = newResponse.data.cards || [];
                                    const newEmbed = await createCardListEmbed(currentCards, currentPage, totalPages, i.user.id);
                                    const newNavigationButtons = createNavigationButtons(currentPage, totalPages);
                                    const newSelectMenu = createCardSelectMenu(currentCards);

                                    const newComponents = [
                                        newNavigationButtons,
                                        newSelectMenu
                                    ].filter(Boolean);

                                    await i.editReply({
                                        embeds: [newEmbed],
                                        components: newComponents
                                    });
                                }
                            }
                        } else if (i.isStringSelectMenu()) {
                            const selectedCard = currentCards.find(c => c.id.toString() === i.values[0]);
                            if (selectedCard) {
                                const detailEmbed = await createCardDetailEmbed(selectedCard, i.user.id);
                                const isWishlisted = await db.isInWishlist(i.user.id, selectedCard.card.id);

                                const wishlistButton = new ButtonBuilder()
                                    .setCustomId('wishlist')
                                    .setEmoji('❤️')
                                    .setStyle(isWishlisted ? ButtonStyle.Danger : ButtonStyle.Success);

                                const backButton = new ButtonBuilder()
                                    .setCustomId('back')
                                    .setLabel('Back to List')
                                    .setStyle(ButtonStyle.Secondary);

                                const actionRow = new ActionRowBuilder()
                                    .addComponents(wishlistButton, backButton);

                                await i.editReply({
                                    embeds: [detailEmbed],
                                    components: [actionRow]
                                });
                            }
                        }
                    } catch (error) {
                        console.error('Error handling interaction:', error);
                        await i.followUp({
                            content: 'An error occurred while processing your request. Please try again.',
                            ephemeral: true
                        });
                    }
                });

                collector.on('end', async () => {
                    try {
                        const finalEmbed = await createCardListEmbed(currentCards, currentPage, totalPages, interaction.user.id)
                            .setFooter({ text: 'This interaction has expired. Please run the command again.' });

                        await interaction.editReply({
                            embeds: [finalEmbed],
                            components: []
                        });
                    } catch (error) {
                        console.error('Error handling collector end:', error);
                    }
                });

            } catch (error) {
                console.error('Error fetching cards:', error);
                await interaction.editReply({
                    content: 'An error occurred while fetching your cards. Please try again later.',
                    components: []
                });
            }

        } catch (error) {
            console.error('Command execution error:', error);
            const errorMessage = 'An error occurred while processing your request. Please try again later.';
            
            try {
                if (interaction.deferred) {
                    await interaction.editReply({ 
                        content: errorMessage,
                        components: []
                    });
                } else {
                    await interaction.reply({ 
                        content: errorMessage, 
                        ephemeral: true 
                    });
                }
            } catch (replyError) {
                console.error('Error sending error message:', replyError);
            }
        }
    }
};