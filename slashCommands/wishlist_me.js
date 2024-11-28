const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const db = require('../database/mongo');
const { handleInteraction, handleCommandError, safeDefer } = require('../utility/interactionHandler');
const getTierEmoji = require('../utility/getTierEmoji');

// Constants
const COOLDOWN_DURATION = 10000;
const CARDS_PER_PAGE = 10;
const INTERACTION_TIMEOUT = 900000; // 15 minutes

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
            .setTitle('Your Wishlisted Cards')
            .setColor('#0099ff');

        let description = `Page ${page} of ${totalPages}\t\t\`${totalCards}\` cards total\n\n`;
        
        if (!Array.isArray(cards) || cards.length === 0) {
            description += 'No cards found.';
        } else {
            const cardIds = cards.map(card => card.id);
            const wishlistCounts = await db.getCardWishlistCount(cardIds);

            cards.forEach(card => {
                if (!card) return;
                const tierEmoji = getTierEmoji(`${card.tier}T`);
                const eventEmoji = card.eventType ? '🎃' : '';
                const wishlistCount = wishlistCounts.get(card.id) || 0;
                description += `${tierEmoji} \`❤️ ${wishlistCount}\` **${card.name}** *${card.series}* ${eventEmoji} :yellow_heart:\n`;
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

        const wishlistCount = await db.getCardWishlistCount(card.id);

        const embed = new EmbedBuilder()
            .setTitle(`${getTierEmoji(`${card.tier}T`)} ${card.name} ${card.eventType ? '🎃' : ''} :yellow_heart:`)
            .setDescription(`[${card.id}](https://mazoku.cc/card/${card.id})\n*${card.series}*`)
            .setImage(`https://cdn.mazoku.cc/cards/${card.id}/card`)
            .setColor('#0099ff')
            .addFields({ 
                name: 'Global Card Details:', 
                value: `\`❤️ ${wishlistCount}\``
            });

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

const createWishlistButton = () => {
    return new ButtonBuilder()
        .setCustomId('wishlist')
        .setEmoji('❎')
        .setStyle(ButtonStyle.Danger);
};

const createBackButton = () => {
    return new ButtonBuilder()
        .setCustomId('back')
        .setLabel('Back to List')
        .setStyle(ButtonStyle.Secondary);
};

// Fetch user's wishlisted cards
const fetchUserWishlistedCards = async (userId) => {
    try {
        const cardIds = await db.getUserWishlist(userId);
        if (!cardIds || cardIds.length === 0) return [];

        const cardDetails = cardIds.map(cardId => {
            const card = allCards.find(c => c.id === cardId);
            return card || null;
        }).filter(card => card !== null);

        // Sort by wishlist count
        const wishlistCounts = await db.getCardWishlistCount(cardDetails.map(card => card.id));
        cardDetails.sort((a, b) => (wishlistCounts.get(b.id) || 0) - (wishlistCounts.get(a.id) || 0));

        return cardDetails;
    } catch (error) {
        console.error('Error fetching user wishlisted cards:', error);
        throw new Error("Failed to fetch your wishlisted cards");
    }
};

// Paginate cards
const paginateCards = (cards, page) => {
    const startIndex = (page - 1) * CARDS_PER_PAGE;
    const endIndex = startIndex + CARDS_PER_PAGE;
    return cards.slice(startIndex, endIndex);
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('wishlist_me')
        .setDescription('View your wishlisted cards'),

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

            try {
                const allWishlistedCards = await fetchUserWishlistedCards(interaction.user.id);
                if (!allWishlistedCards.length) {
                    return await handleInteraction(interaction, {
                        content: 'You have no wishlisted cards.',
                        ephemeral: true
                    }, 'editReply');
                }

                let currentPage = 1;
                const totalPages = Math.ceil(allWishlistedCards.length / CARDS_PER_PAGE);
                const totalCards = allWishlistedCards.length; // Total cards across all pages
                let currentCards = paginateCards(allWishlistedCards, currentPage);

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
                                const success = await db.removeFromWishlist(i.user.id, cardId);

                                if (!success) {
                                    await handleInteraction(i, {
                                        content: 'Failed to remove from wishlist. Please try again.',
                                        ephemeral: true
                                    }, 'followUp');
                                    return;
                                }

                                // Refresh the cards list after removing
                                const updatedAllCards = await fetchUserWishlistedCards(i.user.id);
                                if (!updatedAllCards.length) {
                                    await i.editReply({
                                        content: 'You have no wishlisted cards.',
                                        embeds: [],
                                        components: []
                                    });
                                    return;
                                }

                                currentPage = 1;
                                const newTotalPages = Math.ceil(updatedAllCards.length / CARDS_PER_PAGE);
                                const newTotalCards = updatedAllCards.length;
                                currentCards = paginateCards(updatedAllCards, currentPage);

                                const newEmbed = await createCardListEmbed(currentCards, currentPage, newTotalPages, i.user.id, newTotalCards);
                                const newNavigationButtons = createNavigationButtons(currentPage, newTotalPages);
                                const newSelectMenu = createCardSelectMenu(currentCards);

                                const newComponents = [newNavigationButtons];
                                if (newSelectMenu) newComponents.push(newSelectMenu);

                                await i.editReply({
                                    embeds: [newEmbed],
                                    components: newComponents
                                });
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
                                    currentPage = newPage;
                                    currentCards = paginateCards(allWishlistedCards, currentPage);

                                    const newEmbed = await createCardListEmbed(currentCards, currentPage, totalPages, i.user.id, totalCards);
                                    const newNavigationButtons = createNavigationButtons(currentPage, totalPages);
                                    const newSelectMenu = createCardSelectMenu(currentCards);

                                    const newComponents = [newNavigationButtons];
                                    if (newSelectMenu) newComponents.push(newSelectMenu);

                                    await i.editReply({
                                        embeds: [newEmbed],
                                        components: newComponents
                                    });
                                }
                            }
                        } else if (i.isStringSelectMenu()) {
                            const selectedCard = currentCards.find(c => c.id === i.values[0]);
                            if (selectedCard) {
                                const detailEmbed = await createCardDetailEmbed(selectedCard, i.user.id);
                                const wishlistButton = createWishlistButton();
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

                        await interaction.editReply({
                            embeds: [finalEmbed],
                            components: []
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
