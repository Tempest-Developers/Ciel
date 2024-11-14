const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const getTierEmoji = require('../../utility/getTierEmoji');
const db = require('../../database/mongo');

const createCardListEmbed = async (cards, page, totalPages, userId) => {
    try {
        const embed = new EmbedBuilder()
            .setTitle('Most Wishlisted Cards')
            .setColor('#0099ff');

        let description = `Page ${page} of ${totalPages}\n\n`;
        
        if (!Array.isArray(cards) || cards.length === 0) {
            description += 'No cards found.';
        } else {
            // Create the description with all card information
            cards.forEach(card => {
                if (!card) return;
                const tierEmoji = getTierEmoji(`${card.tier}T`);
                const eventEmoji = card.eventType ? '🎃' : '';
                const wishlistCount = card.wishlistCount || 0;
                const heartEmoji = card.isWishlisted ? ':yellow_heart:' : '❤️';
                description += `${tierEmoji} **${card.name}** ${eventEmoji}*${card.series}* (${wishlistCount} ${heartEmoji})\n`;
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

const createCardDetailEmbed = async (card, userId) => {
    try {
        if (!card) {
            throw new Error('Invalid card data');
        }

        // Get current wishlist status if not provided
        const isWishlisted = card.isWishlisted !== undefined ? 
            card.isWishlisted : 
            await db.isInWishlist(userId, card.id);

        const heartEmoji = isWishlisted ? '❤️' : '';

        const embed = new EmbedBuilder()
            .setTitle(`${getTierEmoji(`${card.tier}T`)} ${card.name} ${card.eventType ? '🎃' : ''} ${heartEmoji}`)
            .setDescription(`[${card.id}](https://mazoku.cc/card/${card.id})\n*${card.series}*`)
            .setImage(`https://cdn.mazoku.cc/packs/${card.id}`)
            .setColor('#0099ff');

        // Use provided wishlist count or fetch it
        const wishlistCount = card.wishlistCount !== undefined ? 
            card.wishlistCount : 
            await db.getCardWishlistCount(card.id);

        embed.addFields(
            { 
                name: 'Global Card Details:', 
                value: `**Wishlist Count** *${wishlistCount}* ❤️`
            }
        );

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
        .setEmoji(isWishlisted ? '❎' : ' ❤️ ️')
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
