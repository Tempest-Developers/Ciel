const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const db = require('../database/mongo');
const { handleInteraction, handleCommandError, safeDefer } = require('../utility/interactionHandler');
const getTierEmoji = require('../utility/getTierEmoji');

// Constants
const COOLDOWN_DURATION = 5000;
const CARDS_PER_PAGE = 10;
const INTERACTION_TIMEOUT = 300000; // 5 minutes

// Function to handle Mazoku API errors
const handleMazokuAPICall = async (apiCall) => {
    try {
        const response = await apiCall();
        return response;
    } catch (error) {
        throw new Error("Mazoku Servers unavailable");
    }
};

// Cooldown management
const cooldowns = new Map();

// Load card data
let allCards;
try {
    allCards = require('../assets/all-cards-mazoku.json');
} catch (error) {
    console.error('Failed to load Mazoku card data:', error);
    throw new Error("Mazoku Servers unavailable");
}

// UI Functions
const createCardListEmbed = async (cards, page, totalPages, userId, totalCards) => {
    try {
        const embed = new EmbedBuilder()
            .setTitle('Card Search Results')
            .setColor('#0099ff');

        let description = `Page ${page} of ${totalPages}\t\t\`${totalCards}\` cards total\n\n`;
        
        if (!Array.isArray(cards) || cards.length === 0) {
            description += 'No cards found.';
        } else {
            const cardIds = cards.map(card => card.id);
            const [wishlistCounts, userWishlistStatus] = await Promise.all([
                db.getCardWishlistCount(cardIds),
                Promise.all(cardIds.map(cardId => db.isInWishlist(userId, cardId)))
            ]);

            cards.forEach((card, index) => {
                if (!card) return;
                const tierEmoji = getTierEmoji(`${card.tier}T`);
                const eventEmoji = card.eventType ? '🎃' : '';
                const wishlistCount = wishlistCounts.get(card.id) || 0;
                const isWishlisted = userWishlistStatus[index];
                const heartEmoji = isWishlisted ? ':yellow_heart:' : '';
                description += `${tierEmoji} \`❤️ ${wishlistCount}\` **${card.name}** *${card.series}* ${eventEmoji} ${heartEmoji}\n`;
            });
        }

        embed.setDescription(description);
        return embed;
    } catch (error) {
        console.error('Error creating card list embed:', error);
        throw new Error('Failed to create card list');
    }
};

const createCardDetailEmbed = async (card, userId) => {
    try {
        if (!card) throw new Error('Invalid card data');

        const [wishlistCount, isWishlisted] = await Promise.all([
            db.getCardWishlistCount(card.id),
            db.isInWishlist(userId, card.id)
        ]);

        const heartEmoji = isWishlisted ? ':yellow_heart:' : '';

        const embed = new EmbedBuilder()
            .setTitle(`${getTierEmoji(`${card.tier}T`)} ${card.name} ${card.eventType ? '🎃' : ''} ${heartEmoji}`)
            .setDescription(`[${card.id}](https://mazoku.cc/card/${card.id})\n\`${card.series}\` \`❤️ ${wishlistCount}\``)
            .setImage(`https://cdn.mazoku.cc/packs/${card.id}`)
            .setColor('#0099ff')

        try {
            const [owners] = await Promise.all([
                handleMazokuAPICall(async () => {
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
            ]);

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
            embed.addFields(
                { 
                    name: 'Global Card Details:', 
                    value: 'Data Unavailable'
                }
            );
        }

        return embed;
    } catch (error) {
        console.error('Error creating card detail embed:', error);
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
    if (!Array.isArray(cards) || cards.length === 0) return null;

    try {
        return new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('cardSelect')
                    .setPlaceholder('Select a card to view details')
                    .addOptions(
                        cards.map(card => ({
                            label: card.name,
                            description: card.series.substring(0, 100),
                            value: card.id
                        }))
                    )
            );
    } catch (error) {
        console.error('Error creating card select menu:', error);
        return null;
    }
};

const createWishlistButton = (isWishlisted) => {
    return new ButtonBuilder()
        .setCustomId('wishlist')
        .setEmoji(isWishlisted ? '❎' : '❤️')
        .setStyle(isWishlisted ? ButtonStyle.Danger : ButtonStyle.Success);
};

const createBackButton = () => {
    return new ButtonBuilder()
        .setCustomId('back')
        .setLabel('Back to List')
        .setStyle(ButtonStyle.Secondary);
};

// Search Function
const searchCards = async (searchParams, page = 1) => {
    try {
        if (!allCards || !Array.isArray(allCards)) {
            throw new Error("Mazoku Servers unavailable");
        }

        let filteredCards = [...allCards];

        if (searchParams) {
            if (searchParams.name) {
                const searchName = searchParams.name.toLowerCase();
                filteredCards = filteredCards.filter(card => 
                    card.name && card.name.toLowerCase().includes(searchName)
                );
            }

            if (searchParams.anime) {
                const searchSeries = searchParams.anime.toLowerCase();
                filteredCards = filteredCards.filter(card => 
                    card.series && card.series.toLowerCase().includes(searchSeries)
                );
            }

            if (searchParams.tier) {
                filteredCards = filteredCards.filter(card => 
                    card.tier === searchParams.tier
                );
            }

            // Sort cards
            if (searchParams.sortBy) {
                const sortBy = searchParams.sortBy;
                const sortOrder = searchParams.sortOrder || "desc";
                
                filteredCards.sort((a, b) => {
                    let comparison = 0;
                    if (sortBy === "dateAdded") {
                        comparison = new Date(a.createdDate || 0) - new Date(b.createdDate || 0);
                    } else if (sortBy === "name") {
                        comparison = (a.name || '').localeCompare(b.name || '');
                    }
                    return sortOrder === "desc" ? -comparison : comparison;
                });
            }
        }

        // Calculate pagination
        const totalPages = Math.max(1, Math.ceil(filteredCards.length / CARDS_PER_PAGE));
        const startIndex = ((page - 1) * CARDS_PER_PAGE);
        const endIndex = Math.min(startIndex + CARDS_PER_PAGE, filteredCards.length);
        const paginatedCards = filteredCards.slice(startIndex, endIndex);

        return {
            cards: paginatedCards,
            totalPages,
            totalCards: filteredCards.length
        };
    } catch (error) {
        console.error('Error searching cards:', error);
        throw new Error("Mazoku Servers unavailable");
    }
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('wishlist_add')
        .setDescription('Search and add cards to your wishlist')
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
            // Guard against non-guild usage
            if (!interaction.guild) {
                return await handleInteraction(interaction, {
                    content: 'This command can only be used in a server.',
                    ephemeral: true
                }, 'reply');
            }

            // Cooldown check
            const cooldownKey = `${interaction.guild.id}-${interaction.user.id}`;
            if (cooldowns.has(cooldownKey)) {
                const expirationTime = cooldowns.get(cooldownKey);
                if (Date.now() < expirationTime) {
                    const timeLeft = (expirationTime - Date.now()) / 1000;
                    return await handleInteraction(interaction, {
                        content: `Please wait ${timeLeft.toFixed(1)} seconds before using this command again.`,
                        ephemeral: true
                    }, 'reply');
                }
            }

            // Set cooldown
            cooldowns.set(cooldownKey, Date.now() + COOLDOWN_DURATION);
            setTimeout(() => cooldowns.delete(cooldownKey), COOLDOWN_DURATION);

            await safeDefer(interaction);

            let currentPage = 1;
            let currentCards = [];
            
            // Get search parameters
            const searchParams = {
                name: interaction.options.getString('name'),
                anime: interaction.options.getString('anime'),
                tier: interaction.options.getString('tier'),
                sortBy: interaction.options.getString('sort_by') || 'dateAdded',
                sortOrder: interaction.options.getString('sort_order') || 'desc'
            };

            try {
                const result = await searchCards(searchParams, currentPage);
                currentCards = result.cards;
                const totalPages = result.totalPages;
                const totalCards = result.totalCards; // This is the total across all pages

                if (!currentCards.length) {
                    return await handleInteraction(interaction, {
                        content: 'No cards found matching your criteria.',
                        ephemeral: true
                    }, 'editReply');
                }

                const embed = await createCardListEmbed(currentCards, currentPage, totalPages, interaction.user.id, totalCards);
                const navigationButtons = createNavigationButtons(currentPage, totalPages);
                const selectMenu = createCardSelectMenu(currentCards);

                const components = [navigationButtons];
                if (selectMenu) components.push(selectMenu);

                const message = await handleInteraction(interaction, {
                    embeds: [embed],
                    components
                }, 'editReply');

                const collector = message.createMessageComponentCollector({
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

                                const wishlistButton = createWishlistButton(!isCurrentlyWishlisted);
                                const backButton = createBackButton();
                                const actionRow = new ActionRowBuilder()
                                    .addComponents(wishlistButton, backButton);

                                const selectedCard = currentCards.find(c => c.id === cardId);
                                if (selectedCard) {
                                    selectedCard.isWishlisted = !isCurrentlyWishlisted;
                                    const updatedEmbed = await createCardDetailEmbed(selectedCard, i.user.id);
                                    await i.editReply({
                                        embeds: [updatedEmbed],
                                        components: [actionRow]
                                    });
                                }
                            } else if (i.customId === 'back') {
                                const newEmbed = await createCardListEmbed(currentCards, currentPage, totalPages, i.user.id, totalCards);
                                const newNavigationButtons = createNavigationButtons(currentPage, totalPages);
                                const newSelectMenu = createCardSelectMenu(currentCards);

                                const newComponents = [newNavigationButtons];
                                if (newSelectMenu) newComponents.push(newSelectMenu);

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
                                        const newResult = await searchCards(searchParams, newPage);
                                        currentCards = newResult.cards;
                                        currentPage = newPage;

                                        const newEmbed = await createCardListEmbed(currentCards, currentPage, totalPages, i.user.id, totalCards);
                                        const newNavigationButtons = createNavigationButtons(currentPage, totalPages);
                                        const newSelectMenu = createCardSelectMenu(currentCards);

                                        const newComponents = [newNavigationButtons];
                                        if (newSelectMenu) newComponents.push(newSelectMenu);

                                        await i.editReply({
                                            embeds: [newEmbed],
                                            components: newComponents
                                        });
                                    } catch (error) {
                                        throw new Error("Failed to load the next page");
                                    }
                                }
                            }
                        } else if (i.isStringSelectMenu()) {
                            const selectedCard = currentCards.find(c => c.id === i.values[0]);
                            if (selectedCard) {
                                const detailEmbed = await createCardDetailEmbed(selectedCard, i.user.id);
                                const isWishlisted = await db.isInWishlist(i.user.id, selectedCard.id);

                                const wishlistButton = createWishlistButton(isWishlisted);
                                const backButton = createBackButton();
                                const actionRow = new ActionRowBuilder()
                                    .addComponents(wishlistButton, backButton);

                                await i.editReply({
                                    embeds: [detailEmbed],
                                    components: [actionRow]
                                });
                            }
                        }
                    } catch (error) {
                        await handleCommandError(i, error, 'An error occurred while processing your request.');
                    }
                });

                collector.on('end', async () => {
                    try {
                        const finalEmbed = await createCardListEmbed(currentCards, currentPage, totalPages, interaction.user.id, totalCards);
                        finalEmbed.setFooter({ text: 'This interaction has expired. Please run the command again.' });

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
                        });
                    } catch (error) {
                        console.error('Error handling collector end:', error);
                    }
                });

            } catch (error) {
                throw error;
            }
        } catch (error) {
            await handleCommandError(interaction, error, 'An error occurred while processing your request.');
        }
    }
};
