const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');
const { getCardWishlistCount, isInWishlist } = require('../database/modules/wishlist');
const { handleInteraction, handleCommandError, safeDefer } = require('../utility/interactionHandler');

// Utility constants
const COOLDOWN_DURATION = 10000;
const EVENT_EMOJI = '🎃 ';
const MAX_SERIES_LENGTH = 15;
const MAX_VERSIONS_DISPLAY = 10;
const OWNERS_PER_PAGE = 10;
const MAX_PAGES = 50;
const INTERACTION_TIMEOUT = 300000; // 5 minutes

// Cooldown management
const cooldowns = new Map();

// Function to handle Mazoku API errors
const handleMazokuAPICall = async (apiCall) => {
    try {
        const response = await apiCall();
        if (!response.ok) {
            throw new Error(`API responded with status ${response.status}`);
        }
        return response;
    } catch (error) {
        console.error('Mazoku API Error:', error);
        throw new Error("Mazoku Servers unavailable");
    }
};

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
    let lowest = Infinity;
    ownersList.forEach(owner => {
        owner.versions.forEach(version => {
            if (version !== 0 && version < lowest) {
                lowest = version;
            }
        });
    });
    return lowest === Infinity ? '*Data Unavailable*' : lowest;
};

const formatVersionsDisplay = (versions) => {
    if (!versions || versions.length === 0) return '*Data Unavailable*';
    if (versions.length <= MAX_VERSIONS_DISPLAY) {
        return versions.map(version => `\`${version === 0 ? 'CM' : version}\``).join(' ');
    }
    const displayVersions = versions.slice(0, MAX_VERSIONS_DISPLAY);
    return `${displayVersions.map(version => `\`${version === 0 ? 'CM' : version}\``).join(' ')} +${versions.length - MAX_VERSIONS_DISPLAY} more`;
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

const formatAutocompleteSuggestion = (card) => {
    const tierDisplay = `[${card.tier || 'Unknown'}]`;
    const eventMark = card.eventType ? EVENT_EMOJI : '';
    const series = formatSeriesName(card.series);
    const name = card.name || '*Data Unavailable*';
    return `${tierDisplay} ${name} ${eventMark}${series}`;
};

const createOwnersEmbed = async (cardDetails, ownersList, userOwnership, page = 1, totalPages, userId) => {
    const cardImageUrl = `https://cdn.mazoku.cc/packs/${cardDetails.id}`;
    const eventMark = cardDetails.eventType ? EVENT_EMOJI : '';
    const lowestPrint = findLowestPrint(ownersList);
    const totalPrints = ownersList.reduce((acc, owner) => acc + owner.versionCount, 0);
    
    const makerMentions = (cardDetails.makers || [])
        .map(maker => `<@${maker}>`)
        .join(' ') || '*Data Unavailable*';

    const tierDisplay = `[${cardDetails.tier || 'Unknown'}]`;
    const cardName = cardDetails.name || '*Data Unavailable*';
    const cardSeries = cardDetails.series || '*Data Unavailable*';

    // Get wishlist information
    const wishlistCount = await getCardWishlistCount(cardDetails.id);
    const isWishlisted = await isInWishlist(userId, cardDetails.id);
    const wishlistInfo = wishlistCount > 0 ? `\n${isWishlisted ? ':yellow_heart:' : '❤️'}${wishlistCount}` : '';

    const statsInfo = [
        `**Series:** ${eventMark}*${cardSeries}*`,
        `**Makers:** ${makerMentions}`,
        `**Card ID:** [${cardDetails.id}](https://mazoku.cc/card/${cardDetails.id})`,
        `**Lowest Print Out**: *${lowestPrint}*`,
        `**Total Prints Claimed**: *${totalPrints}*`,
        `**Total Owners**: *${ownersList.length}*${wishlistInfo}`
    ].join('\n');

    const embed = new EmbedBuilder()
        .setTitle(`${tierDisplay} ${cardName} ${eventMark}`)
        .setDescription(statsInfo)
        .setThumbnail(cardImageUrl);

    if (userOwnership) {
        const versionsString = formatVersionsDisplay(userOwnership.versions);
        embed.addFields({ 
            name: `Your Copies (${userOwnership.versions.length})`, 
            value: versionsString
        });
    }
    
    const startIdx = (page - 1) * OWNERS_PER_PAGE;
    const pageOwners = ownersList.slice(startIdx, startIdx + OWNERS_PER_PAGE);
    
    if (pageOwners.length > 0) {
        const ownersText = pageOwners
            .map(owner => {
                const displayName = owner.user?.username || owner.id || '*Data Unavailable*';
                const versionsString = formatVersionsDisplay(owner.versions);
                return `🔰 *[${displayName}](https://mazoku.cc/user/${owner.id})* ( ${versionsString} ) [ **${owner.versionCount}** ]`;
            })
            .join('\n');

        embed.addFields({
            name: `Owners (Page ${page}/${totalPages})`,
            value: ownersText || '*Data Unavailable*'
        });
    }

    embed.setFooter({ 
        text: `Mazoku Collector | ${new Date().toLocaleString()}`
    });

    return embed;
};

const createNavigationButtons = (currentPage, totalPages) => {
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
            if (!focusedValue) return await interaction.respond([]);

            const cards = await loadCardsData();
            
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
                const components = totalPages > 1 ? [createNavigationButtons(currentPage, totalPages)] : [];
                
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
                            }

                            const newEmbed = await createOwnersEmbed(cardDetails, ownersList, userOwnership, currentPage, totalPages, i.user.id);
                            await handleInteraction(interaction, {
                                embeds: [newEmbed],
                                components: [createNavigationButtons(currentPage, totalPages)]
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
