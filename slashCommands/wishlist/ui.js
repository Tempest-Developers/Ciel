const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const getTierEmoji = require('../../utility/getTierEmoji');
const db = require('../../database/mongo');
const { CARDS_PER_PAGE } = require('./constants');

// Calculate total cards based on pages and last page count
const calculateTotalCards = (totalPages, lastPageCards) => {
    if (totalPages <= 0) return 0;
    if (totalPages === 1) return lastPageCards;
    return ((totalPages - 1) * CARDS_PER_PAGE) + lastPageCards;
};

const createCardListEmbed = async (cards, page, totalPages, userId, isListMode = false, lastPageCards = null) => {
    try {
        const embed = new EmbedBuilder()
            .setTitle('Card Wishlist')
            .setColor('#0099ff');

        const totalCards = calculateTotalCards(totalPages, lastPageCards || cards.length);
        let description = `Page ${page} of ${totalPages}\t\t${totalCards} cards total\n\n`;
        
        if (!Array.isArray(cards) || cards.length === 0) {
            description += 'No cards found.';
        } else {
            // Get all card IDs for bulk wishlist count fetch
            const cardIds = cards.map(card => card.id);
            
            if (isListMode) {
                // For list mode: Use pre-fetched wishlist counts and status
                cards.forEach(card => {
                    if (!card) return;
                    const tierEmoji = getTierEmoji(`${card.tier}T`);
                    const eventEmoji = card.eventType ? '🎃' : '';
                    const wishlistCount = card.wishlistCount || 0;
                    const heartEmoji = card.isWishlisted ? ':yellow_heart:' : '';
                    description += `${tierEmoji} \`❤️ ${wishlistCount}\` **${card.name}** *${card.series}* ${eventEmoji} ${heartEmoji}\n`;
                });
            } else {
                // For search mode: Fetch both global counts and user status
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

const createCardDetailEmbed = async (card, userId) => {
    try {
        if (!card) {
            throw new Error('Invalid card data');
        }

        // Get both global wishlist count and user's wishlist status
        const [wishlistCount, isWishlisted] = await Promise.all([
            db.getCardWishlistCount(card.id),
            db.isInWishlist(userId, card.id)
        ]);

        const heartEmoji = isWishlisted ? ':yellow_heart:' : '';

        const embed = new EmbedBuilder()
            .setTitle(`${getTierEmoji(`${card.tier}T`)} ${card.name} ${card.eventType ? '🎃' : ''} ${heartEmoji}`)
            .setDescription(`[${card.id}](https://mazoku.cc/card/${card.id})\n*${card.series}*`)
            .setImage(`https://cdn.mazoku.cc/packs/${card.id}`)
            .setColor('#0099ff')
            .addFields({ 
                name: 'Global Card Details:', 
                value: `\`❤️ ${wishlistCount}\``
            });

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
    if (!Array.isArray(cards) || cards.length === 0) {
        return null;
    }

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

module.exports = {
    createCardListEmbed,
    createCardDetailEmbed,
    createNavigationButtons,
    createCardSelectMenu,
    createWishlistButton,
    createBackButton
};
