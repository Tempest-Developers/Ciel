const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ComponentType } = require('discord.js');
const axios = require('axios');
const db = require('../database/mongo');
const getTierEmoji = require('../utility/getTierEmoji');
const { handleInteraction, handleCommandError, safeDefer } = require('../utility/interactionHandler');

// Constants
const COOLDOWN_DURATION = 10000;
const CARDS_PER_PAGE = 10;
const INTERACTION_TIMEOUT = 900000; // 15 minutes
const API_URL = 'https://api.mazoku.cc/api/get-inventory-items/';

// Function to handle Mazoku API errors
const handleMazokuAPICall = async (apiCall) => {
    try {
        const response = await apiCall();
        return response;
    } catch (error) {
        console.log('Mazoku API Error:', error.message);
        throw new Error("Mazoku Servers unavailable");
    }
};

// Calculate total cards based on pages and last page count
const calculateTotalCards = (totalPages, lastPageCards) => {
    if (totalPages <= 0) return 0;
    if (totalPages === 1) return lastPageCards;
    return ((totalPages - 1) * CARDS_PER_PAGE) + lastPageCards;
};

// Cooldown management
const cooldowns = new Map();

const versionRanges = {
    'SP': { min: 0, max: 10 },
    'LP': { min: 11, max: 100 },
    'MP': { min: 101, max: 500 },
    'HP': { min: 501, max: 2000 }
};

// Convert tier to format expected by getTierEmoji
const formatTier = (tier) => `${tier}T`;

const createAxiosConfig = (body) => ({
    headers: {
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
        'Host': 'api.mazoku.cc',
        'Content-Length': Buffer.byteLength(JSON.stringify(body))
    },
    timeout: 10000 // 10 second timeout
});

const createBaseRequestBody = (userId) => ({
    page: 1,
    pageSize: CARDS_PER_PAGE,
    name: "",
    type: "Card",
    seriesName: "",
    minVersion: 0,
    maxVersion: 2000,
    sortBy: "dateAdded",
    sortOrder: "desc",
    owner: userId
});

const createCardListEmbed = async (cards, page, totalPages, userId, targetUser, lastPageCards) => {
    try {
        const embed = new EmbedBuilder()
            .setTitle(targetUser ? `${targetUser.username}'s Card Collection` : 'Your Card Collection')
            .setColor('#0099ff');

        const totalCards = calculateTotalCards(totalPages, lastPageCards);
        let description = `Page ${page} of ${totalPages} ( \`${totalCards}\` cards total )\n\n`;
        
        if (!Array.isArray(cards) || cards.length === 0) {
            description += 'No cards found.';
        } else {
            const cardIds = cards.map(item => item.card.id);
            const [wishlistCounts, userWishlistStatus] = await Promise.all([
                db.getCardWishlistCount(cardIds),
                Promise.all(cards.map(item => db.isInWishlist(userId, item.card.id)))
            ]);

            cards.forEach((item, index) => {
                if (!item || !item.card) return;
                const card = item.card;
                const tierEmoji = getTierEmoji(formatTier(card.tier));
                const eventEmoji = card.eventType ? '🎃' : '';
                const wishlistCount = wishlistCounts.get(card.id) || 0;
                const isWishlisted = userWishlistStatus[index];
                const heartEmoji = isWishlisted ? ':yellow_heart:' : '';
                const cardName = card.name || '*Data Unavailable*';
                const cardSeries = card.series || '*Data Unavailable*';
                description += `${tierEmoji} \`❤️ ${wishlistCount}\` #${item.version} **${cardName}** *${cardSeries}* ${eventEmoji} ${heartEmoji}\n`;
            });
        }

        embed.setDescription(description);
        return embed;
    } catch (error) {
        console.log('Error creating card list embed:', error.message);
        throw new Error('Failed to create card list');
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
        const cardName = card.name || '*Data Unavailable*';
        const cardSeries = card.series || '*Data Unavailable*';

        const embed = new EmbedBuilder()
            .setTitle(`${getTierEmoji(formatTier(card.tier))} ${cardName} #${item.version} ${card.eventType ? '🎃' : ''} ${heartEmoji}`)
            .setDescription(`[${card.id}](https://mazoku.cc/card/${card.id})\n*${cardSeries}*`)
            .setImage(`https://cdn.mazoku.cc/packs/${card.id}`)
            .setColor('#0099ff');

        try {
            const [owners, wishlistCount] = await Promise.all([
                handleMazokuAPICall(async () => {
                    const response = await axios.get(
                        `https://api.mazoku.cc/api/get-inventory-items-by-card/${card.id}`,
                        createAxiosConfig({})
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
                        value: `Prints Out \`${totalCopies.toString()}\`\nAll Owners \`${uniqueOwners.toString()}\`\nLowest Print \`#${lowestPrint.toString()}\`\n\`❤️ ${wishlistCount}\` `
                    }
                );
            }
        } catch (error) {
            embed.addFields(
                { 
                    name: 'Global Card Details:', 
                    value: '*Data Unavailable*'
                }
            );
        }

        return embed;
    } catch (error) {
        console.log('Error creating card detail embed:', error.message);
        throw new Error('Failed to create card details');
    }
};

const createNavigationButtons = (currentPage, totalPages) => {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('first')
                .setLabel('First')
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
                .setLabel('Last')
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
        console.log('Error creating card select menu:', error.message);
        return null;
    }
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('inventory')
        .setDescription('View and manage your card collection')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('View cards of a specific user (mention or ID)'))
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
                )),

    async execute(interaction) {
        if (!interaction.isCommand()) return;

        try {
            if (!interaction.guild) {
                return await handleInteraction(interaction, {
                    content: 'This command can only be used in a server.',
                    ephemeral: true
                }, 'reply');
            }

            if (cooldowns.has(interaction.user.id)) {
                const timeLeft = (cooldowns.get(interaction.user.id) - Date.now()) / 1000;
                if (timeLeft > 0) {
                    return await handleInteraction(interaction, {
                        content: `Please wait ${timeLeft.toFixed(1)} seconds before using this command again.`,
                        ephemeral: true
                    }, 'reply');
                }
            }

            cooldowns.set(interaction.user.id, Date.now() + COOLDOWN_DURATION);
            setTimeout(() => cooldowns.delete(interaction.user.id), COOLDOWN_DURATION);

            await safeDefer(interaction);

            const targetUser = interaction.options.getUser('user') || interaction.user;
            let requestBody = createBaseRequestBody(targetUser.id);

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
                const response = await handleMazokuAPICall(async () => {
                    return await axios.post(API_URL, requestBody, createAxiosConfig(requestBody));
                });
                
                let currentCards = response.data.cards || [];
                const totalPages = response.data.pageCount || 1;

                if (currentCards.length === 0) {
                    return await handleInteraction(interaction, {
                        content: 'No cards found matching your criteria.'
                    }, 'editReply');
                }

                // Get the last page to count its cards
                const lastPageResponse = await handleMazokuAPICall(async () => {
                    const lastPageBody = { ...requestBody, page: totalPages };
                    return await axios.post(API_URL, lastPageBody, createAxiosConfig(lastPageBody));
                });
                const lastPageCards = lastPageResponse.data.cards?.length || 0;

                let currentPage = 1;
                const embed = await createCardListEmbed(currentCards, currentPage, totalPages, interaction.user.id, targetUser, lastPageCards);
                const navigationButtons = createNavigationButtons(currentPage, totalPages);
                const selectMenu = createCardSelectMenu(currentCards);

                const components = [navigationButtons];
                if (selectMenu) components.push(selectMenu);

                const reply = await handleInteraction(interaction, {
                    embeds: [embed],
                    components
                }, 'editReply');

                const collector = reply.createMessageComponentCollector({
                    time: INTERACTION_TIMEOUT
                });

                collector.on('collect', async i => {
                    try {
                        if (i.user.id !== interaction.user.id) {
                            await handleInteraction(i, {
                                content: 'You cannot use these controls.',
                                ephemeral: true
                            }, 'reply');
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
                                    await handleInteraction(i, {
                                        content: 'Failed to update wishlist. Please try again.',
                                        ephemeral: true
                                    }, 'followUp');
                                    return;
                                }

                                const wishlistButton = new ButtonBuilder()
                                    .setCustomId('wishlist')
                                    .setEmoji(isCurrentlyWishlisted ? '❎' : '❤️')
                                    .setStyle(isCurrentlyWishlisted ? ButtonStyle.Success : ButtonStyle.Danger);

                                const backButton = new ButtonBuilder()
                                    .setCustomId('back')
                                    .setLabel('Back to List')
                                    .setStyle(ButtonStyle.Secondary);

                                const actionRow = new ActionRowBuilder()
                                    .addComponents(wishlistButton, backButton);

                                const selectedCard = currentCards.find(c => c.card.id === cardId);
                                if (selectedCard) {
                                    const updatedEmbed = await createCardDetailEmbed(selectedCard, i.user.id);
                                    await i.editReply({
                                        embeds: [updatedEmbed],
                                        components: [actionRow]
                                    });
                                } else {
                                    await i.editReply({ 
                                        components: [actionRow] 
                                    });
                                }
                            } else if (i.customId === 'back') {
                                const newEmbed = await createCardListEmbed(currentCards, currentPage, totalPages, i.user.id, targetUser, lastPageCards);
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
                                    try {
                                        const newResponse = await handleMazokuAPICall(async () => {
                                            requestBody.page = newPage;
                                            return await axios.post(API_URL, requestBody, createAxiosConfig(requestBody));
                                        });

                                        currentCards = newResponse.data.cards || [];
                                        currentPage = newPage;

                                        const newEmbed = await createCardListEmbed(currentCards, currentPage, totalPages, i.user.id, targetUser, lastPageCards);
                                        const newNavigationButtons = createNavigationButtons(currentPage, totalPages);
                                        const newSelectMenu = createCardSelectMenu(currentCards);

                                        const newComponents = [newNavigationButtons];
                                        if (newSelectMenu) newComponents.push(newSelectMenu);

                                        await i.editReply({
                                            embeds: [newEmbed],
                                            components: newComponents
                                        });
                                    } catch (error) {
                                        throw new Error("Mazoku Servers unavailable");
                                    }
                                }
                            }
                        } else if (i.isStringSelectMenu()) {
                            const selectedCard = currentCards.find(c => c.id.toString() === i.values[0]);
                            if (selectedCard) {
                                const detailEmbed = await createCardDetailEmbed(selectedCard, i.user.id);
                                const isWishlisted = await db.isInWishlist(i.user.id, selectedCard.card.id);

                                const wishlistButton = new ButtonBuilder()
                                    .setCustomId('wishlist')
                                    .setEmoji(isWishlisted ? '❎' : '❤️')
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
                        await handleCommandError(i, error, error.message === "Mazoku Servers unavailable" 
                            ? "Mazoku Servers unavailable"
                            : "An error occurred while processing your request.");
                    }
                });

                collector.on('end', async () => {
                    try {
                        const finalEmbed = EmbedBuilder.from(await createCardListEmbed(currentCards, currentPage, totalPages, interaction.user.id, targetUser, lastPageCards))
                            .setFooter({ text: 'This interaction has expired. Please run the command again.' });

                        await handleInteraction(interaction, {
                            embeds: [finalEmbed],
                            components: []
                        }, 'editReply');
                    } catch (error) {
                        console.log('Error handling collector end:', error.message);
                    }
                });

            } catch (error) {
                throw error;
            }

        } catch (error) {
            await handleCommandError(interaction, error, error.message === "Mazoku Servers unavailable" 
                ? "Mazoku Servers unavailable"
                : "An error occurred while processing your request.");
        }
    }
};
