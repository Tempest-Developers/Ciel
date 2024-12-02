const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ComponentType } = require('discord.js');
const axios = require('axios');
const db = require('../database/mongo');
const getTierEmoji = require('../utility/getTierEmoji');
const getEventEmoji = require('../utility/getEventEmoji');
const { handleInteraction, handleCommandError, safeDefer } = require('../utility/interactionHandler');

// Constants
const COOLDOWN_DURATION = 5000;
const CARDS_PER_PAGE = 10;
const INTERACTION_TIMEOUT = 300000; // 5 minutes
const API_URL = 'https://api.mazoku.cc/api/get-inventory-items/';

// Function to handle Mazoku API errors
const handleMazokuAPICall = async (apiCall) => {
    try {
        const response = await apiCall();
        return response;
    } catch (error) {
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
    type: "Card",
    name: "",
    seriesName: "",
    sortBy: "dateAdded",
    sortOrder: "desc",
    owner: userId,
    minVersion: 0,
    maxVersion: 2000
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
        const heartEmoji = isWishlisted ? ':yellow_heart:' : '';
        const cardName = card.name || '*Data Unavailable*';
        const cardSeries = card.series || '*Data Unavailable*';
        let eventEmoji = '';
        
        try {
            eventEmoji = card.eventType ? getEventEmoji(card.eventType) : '';
        } catch (error) {
            console.error('Error getting event emoji:', error);
            // If getEventEmoji fails, we'll just use an empty string
        }

        const embed = new EmbedBuilder()
            .setTitle(`${getTierEmoji(formatTier(card.tier))} ${cardName} #${item.version} ${eventEmoji} ${heartEmoji}`)
            .setColor('#0099ff');

        // Add description only if card.id is available
        if (card.id) {
            embed.setDescription(`[${card.id}](https://mazoku.cc/card/${card.id})\n\`${cardSeries}\``);
        } else {
            embed.setDescription(`\`${cardSeries}\``);
        }

        // Set image only if card.id is available
        if (card.id) {
            embed.setImage(`https://cdn.mazoku.cc/packs/${card.id}`);
        }

        try {
            const [owners, wishlistCount] = await Promise.all([
                handleMazokuAPICall(async () => {
                    if (!card.id) throw new Error('Card ID is missing');
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

            // Add wishlist count to the description
            embed.setDescription(embed.data.description + ` \`❤️ ${wishlistCount}\``);

            if (Array.isArray(owners) && owners.length > 0) {
                const totalCopies = owners.length;
                const uniqueOwners = new Set(owners.map(o => o.owner)).size;
                const lowestPrint = Math.min(...owners.map(o => o.version).filter(v => v > 0));

                embed.addFields(
                    { 
                        name: 'Global Card Details:', 
                        value: `Prints Out \`${totalCopies.toString()}\`\nAll Owners \`${uniqueOwners.toString()}\`\nLowest Print \`#${lowestPrint.toString()}\``
                    }
                );
            } else {
                embed.addFields(
                    { 
                        name: 'Global Card Details:', 
                        value: 'No ownership data available'
                    }
                );
            }
        } catch (error) {
            console.error('Error fetching additional card details:', error);
            embed.addFields(
                { 
                    name: 'Global Card Details:', 
                    value: 'Data Unavailable'
                }
            );
        }

        return embed;
    } catch (error) {
        console.error('Error in createCardDetailEmbed:', error);
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
            option.setName('series')
                .setDescription('Filter cards by series name'))
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
            option.setName('card_type')
                .setDescription('Filter cards by type')
                .addChoices(
                    { name: 'Anime', value: 'anime' },
                    { name: 'Manga', value: 'manga' },
                    { name: 'Light Novel', value: 'lightNovel' },
                    { name: 'Game', value: 'game' },
                    { name: 'Other', value: 'other' }
                ))
        .addIntegerOption(option =>
            option.setName('min_version')
                .setDescription('Minimum version number'))
        .addIntegerOption(option =>
            option.setName('max_version')
                .setDescription('Maximum version number'))
        .addStringOption(option =>
            option.setName('event_type')
                .setDescription('Filter cards by event type')
                .addChoices(
                    { name: 'Halloween 🎃', value: 'halloween' },
                    { name: 'Christmas 🎄', value: 'christmas' }
                ))
        .addStringOption(option =>
            option.setName('sort')
                .setDescription('Sort cards')
                .addChoices(
                    { name: 'Recent', value: 'recent' },
                    { name: 'High to Low Tier', value: 'high_to_low' },
                    { name: 'Low to High Tier', value: 'low_to_high' },
                    { name: 'Name [ A - Z ]', value: 'name_asc' },
                    { name: 'Name [ Z - A ]', value: 'name_desc' }
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
            const series = interaction.options.getString('series');
            const tier = interaction.options.getString('tier');
            const cardType = interaction.options.getString('card_type');
            const minVersion = interaction.options.getInteger('min_version');
            const maxVersion = interaction.options.getInteger('max_version');
            const eventType = interaction.options.getString('event_type');
            const sort = interaction.options.getString('sort');

            if (name?.trim()) requestBody.name = name.trim();
            if (series?.trim()) requestBody.seriesName = series.trim();
            if (tier) requestBody.tiers = [tier];
            if (cardType) requestBody.cardType = [cardType];
            if (minVersion !== null) requestBody.minVersion = minVersion;
            if (maxVersion !== null) requestBody.maxVersion = maxVersion;
            if (eventType) requestBody.eventType = eventType;

            // Handle sorting
            switch (sort) {
                case 'recent':
                    requestBody.sortBy = 'dateAdded';
                    requestBody.sortOrder = 'asc';
                    break;
                case 'high_to_low':
                    requestBody.sortBy = 'tier';
                    requestBody.sortOrder = 'asc';
                    break;
                case 'low_to_high':
                    requestBody.sortBy = 'tier';
                    requestBody.sortOrder = 'desc';
                    break;
                case 'name_asc':
                    requestBody.sortBy = 'name';
                    requestBody.sortOrder = 'asc';
                    break;
                case 'name_desc':
                    requestBody.sortBy = 'name';
                    requestBody.sortOrder = 'desc';
                    break;
            }

            // Remove properties that are not included when empty
            if (!requestBody.eventType) delete requestBody.eventType;
            if (!requestBody.tiers) delete requestBody.tiers;
            if (!requestBody.cardType) delete requestBody.cardType;

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

                const message = await interaction.editReply({
                    embeds: [embed],
                    components
                });

                const collector = message.createMessageComponentCollector({
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

                        // Check if the interaction is still valid
                        if (i.message.interaction && i.message.interaction.id !== interaction.id) {
                            await i.reply({
                                content: 'This interaction has expired. Please run the command again.',
                                ephemeral: true
                            });
                            return;
                        }

                        try {
                            await i.deferUpdate();
                        } catch (error) {
                            if (error.code === 10062) {  // Unknown interaction error
                                console.log('Interaction expired, ignoring.');
                                return;
                            }
                            throw error;
                        }

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
                                try {
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
                                } catch (error) {
                                    console.error('Error creating card detail embed:', error);
                                    await handleCommandError(i, error, "An error occurred while fetching card details.");
                                }
                            } else {
                                await handleCommandError(i, new Error('Selected card not found'), "The selected card could not be found.");
                            }
                        }
                    } catch (error) {
                        if (error.code === 10062) {  // Unknown interaction error
                            console.log('Interaction expired, ignoring.');
                        } else {
                            await handleCommandError(i, error, error.message === "Mazoku Servers unavailable" 
                                ? "Mazoku Servers unavailable"
                                : "An error occurred while processing your request.");
                        }
                    }
                });

                collector.on('end', async () => {
                    try {
                        const finalEmbed = EmbedBuilder.from(embed)
                            .setFooter({ text: 'This interaction has expired. Please run the command again.' });

                        const disabledComponents = components.map(row => {
                            const newRow = new ActionRowBuilder().addComponents(
                                row.components.map(component => {
                                    if (component instanceof ButtonBuilder) {
                                        return ButtonBuilder.from(component).setDisabled(true);
                                    } else if (component instanceof StringSelectMenuBuilder) {
                                        return StringSelectMenuBuilder.from(component).setDisabled(true);
                                    }
                                    return component;
                                })
                            );
                            return newRow;
                        });

                        await interaction.editReply({
                            embeds: [finalEmbed],
                            components: disabledComponents
                        }).catch(error => {
                            if (error.code === 10062) {  // Unknown interaction error
                                console.log('Interaction expired, unable to update message.');
                            } else {
                                console.error('Error updating message after collector end:', error);
                            }
                        });
                    } catch (error) {
                        console.error('Error in collector end event:', error);
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
