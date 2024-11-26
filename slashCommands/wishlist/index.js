const { SlashCommandBuilder, ActionRowBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database/mongo');
const { COOLDOWN_DURATION, INTERACTION_TIMEOUT, CARDS_PER_PAGE } = require('./constants');
const { searchCards } = require('./api');
const { 
    createCardListEmbed, 
    createNavigationButtons, 
    createCardSelectMenu,
    createWishlistButton,
    createBackButton,
    createCardDetailEmbed
} = require('./ui');
const {
    sortByWishlistCount,
    fetchAllWishlistedCards,
    fetchUserWishlistedCards,
    paginateCards,
    toggleWishlist
} = require('./cardManager');
const { handleInteraction, handleCommandError, safeDefer } = require('../../utility/interactionHandler');

// Cooldown management
const cooldowns = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('wishlist')
        .setDescription('View and manage card wishlists')
        .addSubcommand(subcommand =>
            subcommand
                .setName('global')
                .setDescription('View most wishlisted cards globally'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('me')
                .setDescription('View your wishlisted cards'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Search through all cards')
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
                            { name: 'Name', value: 'name' },
                        ))
                .addStringOption(option =>
                    option.setName('sort_order')
                        .setDescription('Sort order')
                        .addChoices(
                            { name: 'Ascending', value: 'asc' },
                            { name: 'Descending', value: 'desc' }
                        ))),

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

            // Cooldown check with guild-specific cooldown
            const guildId = interaction.guild.id;
            const userId = interaction.user.id;
            const cooldownKey = `${guildId}-${userId}`;

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

            const mode = interaction.options.getSubcommand();
            const isGlobalMode = mode === 'global';
            const isMeMode = mode === 'me';
            const isAddMode = mode === 'add';
            
            let currentCards = [];
            let currentPage = 1;
            let totalPages = 1;
            let allCards = [];
            let lastPageCards = 0;
            let totalCards = 0;

            // Store search parameters for pagination
            const searchParams = isAddMode ? {
                name: interaction.options.getString('name'),
                anime: interaction.options.getString('anime'),
                tier: interaction.options.getString('tier'),
                sortBy: interaction.options.getString('sort_by'),
                sortOrder: interaction.options.getString('sort_order') || 'desc',
                type: interaction.options.getString('type')
            } : null;

            try {
                if (isGlobalMode) {
                    // Fetch all wishlisted cards sorted by wishlist count
                    allCards = await fetchAllWishlistedCards(interaction.user.id);
                    if (!allCards.length) {
                        return await handleInteraction(interaction, {
                            content: 'No wishlisted cards found globally.',
                            ephemeral: true
                        }, 'editReply');
                    }
                    totalPages = Math.ceil(allCards.length / CARDS_PER_PAGE);
                    currentCards = paginateCards(allCards, currentPage);
                    lastPageCards = allCards.length % CARDS_PER_PAGE || CARDS_PER_PAGE;
                    totalCards = allCards.length;
                } else if (isMeMode) {
                    // Fetch user's personal wishlist
                    allCards = await fetchUserWishlistedCards(interaction.user.id);
                    if (!allCards.length) {
                        return await handleInteraction(interaction, {
                            content: 'You have no wishlisted cards.',
                            ephemeral: true
                        }, 'editReply');
                    }
                    totalPages = Math.ceil(allCards.length / CARDS_PER_PAGE);
                    currentCards = paginateCards(allCards, currentPage);
                    lastPageCards = allCards.length % CARDS_PER_PAGE || CARDS_PER_PAGE;
                    totalCards = allCards.length;
                } else if (isAddMode) {
                    try {
                        const result = await searchCards(searchParams, currentPage);
                        currentCards = result.cards;
                        totalPages = result.totalPages;
                        totalCards = result.totalCards;
                        lastPageCards = totalCards % CARDS_PER_PAGE || CARDS_PER_PAGE;

                        if (searchParams.sortBy === 'wishlist') {
                            currentCards = await sortByWishlistCount(currentCards, interaction.user.id);
                        }
                    } catch (error) {
                        console.error('Search error:', error);
                        return await handleInteraction(interaction, {
                            content: 'Failed to search cards. Please try again.',
                            ephemeral: true
                        }, 'editReply');
                    }
                }

                if (currentCards.length === 0) {
                    return await handleInteraction(interaction, {
                        content: 'No cards found matching your criteria.',
                        ephemeral: true
                    }, 'editReply');
                }

                const embed = await createCardListEmbed(currentCards, currentPage, totalPages, interaction.user.id, isGlobalMode || isMeMode, lastPageCards);
                const navigationButtons = createNavigationButtons(currentPage, totalPages);
                const selectMenu = createCardSelectMenu(currentCards);

                const components = [navigationButtons];
                if (selectMenu) {
                    components.push(selectMenu);
                }

                await handleInteraction(interaction, {
                    embeds: [embed],
                    components
                }, 'editReply');

                const collector = interaction.channel.createMessageComponentCollector({
                    filter: i => i.user.id === interaction.user.id,
                    time: INTERACTION_TIMEOUT
                });

                collector.on('collect', async i => {
                    try {
                        await i.deferUpdate();

                        if (i.isButton()) {
                            if (i.customId === 'wishlist') {
                                const cardId = i.message.embeds[0].description.split('\n')[0].split('[')[1].split(']')[0];
                                const result = await toggleWishlist(i.user.id, cardId);
                                
                                if (!result.success) {
                                    await handleInteraction(i, {
                                        content: 'Failed to update wishlist. Please try again.',
                                        ephemeral: true
                                    }, 'followUp');
                                    return;
                                }

                                const wishlistButton = createWishlistButton(result.isWishlisted);
                                const backButton = createBackButton();
                                const actionRow = new ActionRowBuilder()
                                    .addComponents(wishlistButton, backButton);

                                const selectedCard = currentCards.find(c => c.id === cardId);
                                if (selectedCard) {
                                    selectedCard.isWishlisted = result.isWishlisted;
                                    const updatedEmbed = await createCardDetailEmbed(selectedCard, i.user.id);
                                    await i.editReply({
                                        embeds: [updatedEmbed],
                                        components: [actionRow]
                                    });
                                }
                            } else if (i.customId === 'back') {
                                const newEmbed = await createCardListEmbed(currentCards, currentPage, totalPages, i.user.id, isGlobalMode || isMeMode, lastPageCards);
                                const newNavigationButtons = createNavigationButtons(currentPage, totalPages);
                                const newSelectMenu = createCardSelectMenu(currentCards);

                                const newComponents = [newNavigationButtons];
                                if (newSelectMenu) {
                                    newComponents.push(newSelectMenu);
                                }

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
                                        if (isGlobalMode || isMeMode) {
                                            currentPage = newPage;
                                            currentCards = paginateCards(allCards, currentPage);
                                        } else if (isAddMode) {
                                            const result = await searchCards(searchParams, newPage);
                                            currentCards = result.cards;
                                            currentPage = newPage;

                                            if (searchParams.sortBy === 'wishlist') {
                                                currentCards = await sortByWishlistCount(currentCards, interaction.user.id);
                                            }
                                        }
                                        
                                        const newEmbed = await createCardListEmbed(currentCards, currentPage, totalPages, i.user.id, isGlobalMode || isMeMode, lastPageCards);
                                        const newNavigationButtons = createNavigationButtons(currentPage, totalPages);
                                        const newSelectMenu = createCardSelectMenu(currentCards);

                                        const newComponents = [newNavigationButtons];
                                        if (newSelectMenu) {
                                            newComponents.push(newSelectMenu);
                                        }

                                        await i.editReply({
                                            embeds: [newEmbed],
                                            components: newComponents
                                        });
                                    } catch (error) {
                                        console.error('Page navigation error:', error);
                                        await handleInteraction(i, {
                                            content: 'Failed to load the next page. Please try again.',
                                            ephemeral: true
                                        }, 'followUp');
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
                        console.error('Interaction error:', error);
                        await handleCommandError(i, error, 'An error occurred while processing your request. Please try again.');
                    }
                });

                collector.on('end', () => {
                    console.log('Wishlist command interaction collector ended');
                    console.log(`${interaction.user.tag} | ${interaction.user.id} | ${interaction.guild.name} | ${interaction.guild.id}`);
                });

            } catch (error) {
                console.error('Command execution error:', error);
                await handleCommandError(interaction, error, 'An error occurred while processing your request. Please try again.');
            }
        } catch (error) {
            console.error('Top-level error:', error);
            await handleCommandError(interaction, error, 'An error occurred while processing your request. Please try again.');
        }
    }
};
