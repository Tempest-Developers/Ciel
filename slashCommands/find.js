const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');
const { getCardWishlistCount, isInWishlist } = require('../database/modules/wishlist');
const { handleInteraction, handleCommandError, safeDefer } = require('../utility/interactionHandler');
const getEventEmoji = require('../utility/getEventEmoji');
const getTierEmoji = require('../utility/getTierEmoji');

// Utility constants
const COOLDOWN_DURATION = 5000;
const MAX_SERIES_LENGTH = 30;
const MAX_VERSIONS_DISPLAY = 3;
const OWNERS_PER_PAGE = 10;
const MAX_PAGES = 100;
const INTERACTION_TIMEOUT = 300000; // 5 minutes

// Cooldown management
const cooldowns = new Map();

// Utility functions
const formatSeriesName = (series) => {
    if (!series) return '*Data Unavailable*';
    return series.length > MAX_SERIES_LENGTH ? 
        series.substring(0, MAX_SERIES_LENGTH - 3) + '...' : 
        series;
};

const sortVersions = (versions) => {
    return versions.sort((a, b) => {
        if (a === 0) return -1;
        if (b === 0) return 1;
        return a - b;
    });
};

const hasCMPrint = (versions) => versions.includes(0);

const findLowestPrint = (ownersList) => {
    let versions = [];
    ownersList.forEach(owner => {
      owner.versions.forEach(version => {
        if (version !== 0) {
          versions.push(version);
        }
      });
    });
    // Sort the versions in ascending order and remove duplicates
    versions = [...new Set(versions)].sort((a, b) => a - b);
    // Return up to the three lowest versions separated by spaces, or '*Data Unavailable*' if there are no versions
    if (versions.length === 0) return '*Data Unavailable*';
    if (versions.length === 1) return `\`${versions[0]}\``;
    if (versions.length === 2) return `\`${versions[0]}\` \`${versions[1]}\``;
    if (versions.length === 3) return `\`${versions[0]}\` \`${versions[1]}\` \`${versions[2]}\``;
    return `\`${versions[0]}\` \`${versions[1]}\` \`${versions[2]}\` \`${versions[3]}\``;
  };

const formatVersionsDisplay = (versions) => {
    if (!versions || versions.length === 0) return '*Data Unavailable*';
    if (versions.length <= MAX_VERSIONS_DISPLAY) {
        return versions.map(version => `\`${version === 0 ? 'CM' : version}\``).join(' ');
    }
    const displayVersions = versions.slice(0, MAX_VERSIONS_DISPLAY);
    return `${displayVersions.map(version => `\`${version === 0 ? 'CM' : version}\``).join(' ')} +**${versions.length - MAX_VERSIONS_DISPLAY}** more`;
};

const loadCardsData = async () => {
    try {
        const filePath = path.join(__dirname, '..', 'assets', 'all-cards-mazoku.json');
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading cards data:', error);
        throw new Error('Failed to load cards data');
    }
};

const totalCardsRemaining = async (tier) => {
    tierCount = {
        C: 2000,
        R: 750,
        SR: 250,
        SSR: 100
    };
    return tierCount[tier];
}

const formatAutocompleteSuggestion = (card) => {
    const tierDisplay = `[${card.tier || 'Unknown'}]`;
    const eventMark = card.eventType ? getEventEmoji(card.eventType) : '';
    const series = formatSeriesName(card.series);
    const name = card.name || '*Data Unavailable*';
    return `${tierDisplay}${eventMark} ${name} | ${series}`;
};

const createOwnersEmbed = async (cardDetails, ownersList, userOwnership, page = 1, totalPages, userId) => {
    const cardImageUrl = `https://cdn.mazoku.cc/packs/${cardDetails.id}`;
    const eventMark = cardDetails.eventType ? getEventEmoji(cardDetails.eventType) : '';
    const lowestPrint = findLowestPrint(ownersList);
    const totalPrints = ownersList.reduce((acc, owner) => acc + owner.versionCount, 0);
    const batchId = cardDetails.batchId;
    
    const makerMentions = (cardDetails.makers || [])
        .map(maker => `<@${maker}>`)
        .join(' ') || '*Data Unavailable*';

    const tierDisplay = `[${cardDetails.tier || 'Unknown'}]`;
    const cardName = cardDetails.name || '*Data Unavailable*';
    const cardSeries = cardDetails.series || '*Data Unavailable*';

    // Get wishlist information
    const wishlistCount = await getCardWishlistCount(cardDetails.id);
    const isWishlisted = await isInWishlist(userId, cardDetails.id);
    const wishlistInfo = `\`❤️ ${wishlistCount}\``;

    const statsInfo = [
        `**Series:** ${eventMark}\`${cardSeries}\` [${wishlistInfo}]`,
        `**Makers:** ${makerMentions}`,
        `**Card ID:** [${cardDetails.id}](https://mazoku.cc/card/${cardDetails.id})`,
        `**Lowest Print Out**: ${lowestPrint}`,
        `**Total Prints Claimed**: \`${totalPrints}\` / \`${await totalCardsRemaining(cardDetails.tier)}\``,
        `**Total Owners**: \`${ownersList.length}\``,
        `**Batch** \`${batchId}\``
    ].join('\n');

    const embed = new EmbedBuilder()
        .setTitle(`${getTierEmoji(cardDetails.tier+"T")} ${cardName} ${eventMark}`)
        .setDescription(statsInfo)
        .setThumbnail(cardImageUrl);

    if (userOwnership) {
        const versionsString = formatVersionsDisplay(userOwnership.versions);
        embed.addFields({ 
            name: `Your Copies ( \`${userOwnership.versions.length}\` )`, 
            value: `<@${userId}> \`ver:\` `+versionsString
        });
    }
    
    const startIdx = (page - 1) * OWNERS_PER_PAGE;
    const pageOwners = ownersList.slice(startIdx, startIdx + OWNERS_PER_PAGE);
    
    if (pageOwners.length > 0) {
        const ownersText = pageOwners
            .map(owner => {
                const displayName = owner.user?.username || owner.id || '*Data Unavailable*';
                const versionsString = formatVersionsDisplay(owner.versions);
                return `※ [${displayName.substring(0, 18)}](https://mazoku.cc/user/${owner.id}) ${versionsString} [ **${owner.versionCount}** ]`;
            })
            .join('\n');

        embed.addFields({
            name: `Owners ( Page \`${page}\`/\`${totalPages}\` )`,
            value: ownersText || '*Data Unavailable*'
        });
    }

    embed.setFooter({ 
        text: `Mazoku Collector`
    });

    return embed;
};

const createNavigationButtons = (currentPage, totalPages, cardDetails) => {
    const row = new ActionRowBuilder();
    
    row.addComponents(
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
            .setCustomId('full_image')
            .setLabel('🖼️')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(false),
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

    return row;
};

const createFullImageEmbed = (cardDetails) => {
    const cardImageUrl = `https://cdn.mazoku.cc/packs/${cardDetails.id}`;
    const eventMark = cardDetails.eventType ? getEventEmoji(cardDetails.eventType) : '';
    
    const tierDisplay = `[${cardDetails.tier || 'Unknown'}]`;
    const cardName = cardDetails.name || '*Data Unavailable*';

    const embed = new EmbedBuilder()
        .setTitle(`${getTierEmoji(cardDetails.tier+"T")} ${cardName} ${eventMark} - Full Image`)
        .setImage(cardImageUrl)
        .setFooter({ text: 'Full Card Image' });

    return embed;
};

const createFullImageButtons = () => {
    const row = new ActionRowBuilder();
    
    row.addComponents(
        new ButtonBuilder()
            .setCustomId('back_to_owners')
            .setLabel('Back to Owners')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(false)
    );

    return row;
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('find')
        .setDescription('Search through all cards')
        .addStringOption(option =>
            option.setName('card')
                .setDescription('Search for a card by name ( Suggestion will be shown )')
                .setRequired(true)
                .setAutocomplete(true)),

    async autocomplete(interaction) {
        if (!interaction.isAutocomplete()) return;
        
        try {
            const focusedValue = interaction.options.getFocused().toLowerCase();
            const cards = await loadCardsData();
            
            // If no input, return default Rimuru suggestion
            if (!focusedValue) {
                const rimuruCards = cards.filter(card => 
                    card.name?.toLowerCase().includes('rimuru')
                );
                
                if (rimuruCards.length > 0) {
                    const suggestions = rimuruCards
                        .slice(0, 25)
                        .map(card => ({
                            name: formatAutocompleteSuggestion(card),
                            value: card.id
                        }));
                    
                    return await interaction.respond(suggestions);
                }
            }

            // First try to find exact matches
            const exactMatches = cards.filter(card => 
                card.name?.toLowerCase() === focusedValue
            );

            // If no exact matches, fall back to partial matches
            const matches = exactMatches.length > 0 ? exactMatches : 
                cards.filter(card => 
                    card.name?.toLowerCase().includes(focusedValue)
                );

            const suggestions = matches
                .slice(0, 25)
                .map(card => ({
                    name: formatAutocompleteSuggestion(card),
                    value: card.id
                }));

            await interaction.respond(suggestions);
        } catch (error) {
            console.error('Error in autocomplete:', error);
            await interaction.respond([]);
        }
    },

    async execute(interaction) {
        try {
            const { user } = interaction;
            
            // Check cooldown
            if (cooldowns.has(user.id)) {
                const expirationTime = cooldowns.get(user.id);
                if (Date.now() < expirationTime) {
                    const timeLeft = (expirationTime - Date.now()) / 1000;
                    return await handleInteraction(interaction, { 
                        content: `Please wait ${timeLeft.toFixed(1)} seconds before using this command again.`,
                        ephemeral: true 
                    });
                }
            }

            // Set cooldown
            cooldowns.set(user.id, Date.now() + COOLDOWN_DURATION);
            setTimeout(() => cooldowns.delete(user.id), COOLDOWN_DURATION);

            // Defer the reply
            await safeDefer(interaction);
            
            const cardId = interaction.options.getString('card');
            if (!cardId) {
                return await handleInteraction(interaction, {
                    content: 'Please provide a search term.'
                }, 'editReply');
            }

            // Load card data
            const cards = await loadCardsData();
            const cardDetails = cards.find(card => card.id === cardId);

            if (!cardDetails) {
                return await handleInteraction(interaction, {
                    content: 'No card found with the specified ID.'
                }, 'editReply');
            }

            try {
                // Fetch owners data
                const response = await fetch(`https://api.mazoku.cc/api/get-inventory-items-by-card/${cardDetails.id}`);
                if (!response.ok) {
                    throw new Error(`API responded with status ${response.status}`);
                }
                const owners = await response.json();

                if (!Array.isArray(owners)) {
                    throw new Error('Invalid owners data format received from API');
                }

                // Process owners data
                const ownerCounts = owners.reduce((acc, item) => {
                    if (!item?.owner) return acc;
                    
                    const ownerId = item.owner;
                    if (!acc[ownerId]) {
                        acc[ownerId] = {
                            user: item.user || null,
                            versions: []
                        };
                    }
                    if (item.version !== undefined && item.version !== null) {
                        acc[ownerId].versions.push(item.version);
                    }
                    return acc;
                }, {});

                // Sort versions for each owner
                Object.values(ownerCounts).forEach(owner => {
                    owner.versions = sortVersions(owner.versions);
                });

                // Create owners list
                const ownersList = Object.entries(ownerCounts)
                    .map(([ownerId, data]) => ({
                        id: ownerId,
                        user: data.user,
                        versionCount: data.versions.length,
                        versions: data.versions
                    }))
                    .sort((a, b) => {
                        const aCM = hasCMPrint(a.versions);
                        const bCM = hasCMPrint(b.versions);
                        if (aCM && !bCM) return -1;
                        if (!aCM && bCM) return 1;
                        return 0;
                    });

                const totalPages = Math.min(Math.ceil(ownersList.length / OWNERS_PER_PAGE), MAX_PAGES);
                const userOwnership = ownerCounts[interaction.user.id];
                let currentPage = 1;
                
                // Create and send initial embed
                const initialEmbed = await createOwnersEmbed(cardDetails, ownersList, userOwnership, currentPage, totalPages, interaction.user.id);
                const components = totalPages > 1 ? [createNavigationButtons(currentPage, totalPages, cardDetails)] : [];
                
                const message = await handleInteraction(interaction, {
                    embeds: [initialEmbed],
                    components
                }, 'editReply');

                if (totalPages > 1 && message) {
                    const collector = message.createMessageComponentCollector({
                        componentType: ComponentType.Button,
                        time: INTERACTION_TIMEOUT
                    });

                    collector.on('collect', async i => {
                        try {
                            if (i.user.id !== interaction.user.id) {
                                await handleInteraction(i, { 
                                    content: 'You cannot use these buttons.', 
                                    ephemeral: true 
                                }, 'reply');
                                return;
                            }

                            await i.deferUpdate();

                            switch (i.customId) {
                                case 'first': currentPage = 1; break;
                                case 'prev': currentPage = Math.max(1, currentPage - 1); break;
                                case 'next': currentPage = Math.min(totalPages, currentPage + 1); break;
                                case 'last': currentPage = totalPages; break;
                                case 'full_image': {
                                    const fullImageEmbed = createFullImageEmbed(cardDetails);
                                    await handleInteraction(interaction, {
                                        embeds: [fullImageEmbed],
                                        components: [createFullImageButtons()]
                                    }, 'editReply');
                                    return;
                                }
                                case 'back_to_owners': {
                                    const newEmbed = await createOwnersEmbed(cardDetails, ownersList, userOwnership, currentPage, totalPages, i.user.id);
                                    await handleInteraction(interaction, {
                                        embeds: [newEmbed],
                                        components: [createNavigationButtons(currentPage, totalPages, cardDetails)]
                                    }, 'editReply');
                                    return;
                                }
                            }

                            const newEmbed = await createOwnersEmbed(cardDetails, ownersList, userOwnership, currentPage, totalPages, i.user.id);
                            await handleInteraction(interaction, {
                                embeds: [newEmbed],
                                components: [createNavigationButtons(currentPage, totalPages, cardDetails)]
                            }, 'editReply');
                        } catch (error) {
                            console.error('Error handling button interaction:', error);
                            await handleInteraction(i, {
                                content: '❌ An error occurred while processing your request.',
                                ephemeral: true
                            }, 'followUp');
                        }
                    });

                    collector.on('end', async () => {
                        try {
                            const finalEmbed = EmbedBuilder.from(initialEmbed)
                                .setFooter({ text: 'This interaction has expired. Please run the command again.' });
                            
                            await handleInteraction(interaction, {
                                embeds: [finalEmbed],
                                components: []
                            }, 'editReply');
                        } catch (error) {
                            console.error('Failed to cleanup after collector end:', error);
                        }
                    });
                }
            } catch (error) {
                throw new Error("Mazoku Servers unavailable");
            }
        } catch (error) {
            await handleCommandError(interaction, error);
        }
    }
};
