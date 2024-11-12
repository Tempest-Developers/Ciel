const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType } = require('discord.js');

// Add cooldown system
const cooldowns = new Map();
const COOLDOWN_DURATION = 30000; // 30 seconds in milliseconds

let cachedCards = null;
let cacheTimestamp = 0;
let cachedFilteredResults = new Map();
const CACHE_DURATION = 30000; // 30 seconds cache
const MIN_SEARCH_LENGTH = 2; // Minimum characters before searching
const EVENT_EMOJI = '🎃 '; // Cached emoji string
const MAX_SERIES_LENGTH = 30; // Max length for series name in autocomplete
const MAX_VERSIONS_DISPLAY = 15; // Maximum number of versions to display per owner

// Helper function to format series name
const formatSeriesName = (series) => {
    return series.length > MAX_SERIES_LENGTH ? 
        series.substring(0, MAX_SERIES_LENGTH - 3) + '...' : 
        series;
};

// Helper function to format card suggestion
const formatCardSuggestion = (card) => {
    const eventMark = card.eventType ? EVENT_EMOJI : '';
    const series = formatSeriesName(card.series);
    return `${card.tier} | ${card.name} ${eventMark}(${series})`;
};

// Helper function to sort versions with CM (0) first
const sortVersions = (versions) => {
    return versions.sort((a, b) => {
        if (a === 0) return -1;
        if (b === 0) return 1;
        return a - b;
    });
};

// Helper function to check if owner has CM print
const hasCMPrint = (versions) => {
    return versions.includes(0);
};

// Helper function to find lowest print number (excluding CM)
const findLowestPrint = (ownersList) => {
    let lowest = Infinity;
    ownersList.forEach(owner => {
        owner.versions.forEach(version => {
            if (version !== 0 && version < lowest) {
                lowest = version;
            }
        });
    });
    return lowest === Infinity ? 'N/A' : lowest;
};

// Helper function to format versions display with limit
const formatVersionsDisplay = (versions) => {
    if (versions.length <= MAX_VERSIONS_DISPLAY) {
        return versions.map(version => `\`${version === 0 ? 'CM' : version}\``).join(' ');
    }
    const displayVersions = versions.slice(0, MAX_VERSIONS_DISPLAY);
    return `${displayVersions.map(version => `\`${version === 0 ? 'CM' : version}\``).join(' ')} +${versions.length - MAX_VERSIONS_DISPLAY} more`;
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('search')
        .setDescription('Search through all cards')
        .addStringOption(option =>
            option.setName('card')
                .setDescription('Search for a card by name')
                .setRequired(true)
                .setAutocomplete(true)),

    async autocomplete(interaction) {
        try {
            const focusedValue = interaction.options.getFocused().toLowerCase();
            
            if (focusedValue.length < MIN_SEARCH_LENGTH) {
                return await interaction.respond([]);
            }

            const cachedResult = cachedFilteredResults.get(focusedValue);
            if (cachedResult) {
                return await interaction.respond(cachedResult);
            }

            const now = Date.now();
            let cards;

            if (cachedCards && now - cacheTimestamp < CACHE_DURATION) {
                cards = cachedCards;
            } else {
                const response = await fetch('https://api.mazoku.cc/api/all-cards');
                if (!response.ok) {
                    throw new Error('Failed to fetch cards');
                }
                
                cards = await response.json();
                cachedCards = cards;
                cacheTimestamp = now;
            }

            const filtered = cards
                .filter(card => card?.name?.toLowerCase().includes(focusedValue))
                .map(card => ({
                    name: formatCardSuggestion(card),
                    value: card.id
                }))
                .slice(0, 25);

            cachedFilteredResults.set(focusedValue, filtered);

            if (cachedFilteredResults.size > 100) {
                const oldestKey = cachedFilteredResults.keys().next().value;
                cachedFilteredResults.delete(oldestKey);
            }

            await interaction.respond(filtered);
        } catch (error) {
            console.error('Autocomplete error:', error);
            await interaction.respond([]);
        }
    },

    async execute(interaction) {
        // Add cooldown check
        const { user } = interaction;
        if (cooldowns.has(user.id)) {
            const expirationTime = cooldowns.get(user.id);
            if (Date.now() < expirationTime) {
                const timeLeft = (expirationTime - Date.now()) / 1000;
                return await interaction.reply({ 
                    content: `Please wait ${timeLeft.toFixed(1)} seconds before using this command again.`,
                    ephemeral: true 
                });
            }
        }

        // Set cooldown
        cooldowns.set(user.id, Date.now() + COOLDOWN_DURATION);
        setTimeout(() => cooldowns.delete(user.id), COOLDOWN_DURATION);

        await interaction.deferReply();
        
        try {
            const cardId = interaction.options.getString('card');
            
            const ownersResponse = await fetch(`https://api.mazoku.cc/api/get-inventory-items-by-card/${cardId}`);
            if (!ownersResponse.ok) {
                throw new Error('Failed to fetch card owners');
            }
            const owners = await ownersResponse.json();

            let cardDetails;
            if (cachedCards) {
                cardDetails = cachedCards.find(card => card.id === cardId);
            }
            
            if (!cardDetails) {
                const cardResponse = await fetch('https://api.mazoku.cc/api/all-cards');
                if (!cardResponse.ok) {
                    throw new Error('Failed to fetch card details');
                }
                const cards = await cardResponse.json();
                cardDetails = cards.find(card => card.id === cardId);
            }

            if (!cardDetails) {
                return await interaction.editReply('Card not found.');
            }

            const ownerCounts = (owners || []).reduce((acc, item) => {
                if (!item || !item.owner) return acc;
                
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

            // Sort versions for each owner with CM (0) first
            Object.values(ownerCounts).forEach(owner => {
                owner.versions = sortVersions(owner.versions);
            });

            const ownersList = Object.entries(ownerCounts)
                .map(([ownerId, data]) => ({
                    id: ownerId,
                    user: data.user,
                    versionCount: data.versions.length,
                    versions: data.versions
                }))
                .sort((a, b) => {
                    // Sort owners with CM prints first
                    const aCM = hasCMPrint(a.versions);
                    const bCM = hasCMPrint(b.versions);
                    if (aCM && !bCM) return -1;
                    if (!aCM && bCM) return 1;
                    return 0;
                });

            const ITEMS_PER_PAGE = 10;
            const totalPages = Math.min(Math.ceil(ownersList.length / ITEMS_PER_PAGE) + 1, 25); // Limit to 24 pages + details page
            let currentPage = 0;
            
            const generateEmbed = (page) => {
                const cardImageUrl = `https://cdn.mazoku.cc/packs/${cardId}`;
                const eventMark = cardDetails.eventType ? EVENT_EMOJI : '';
                const lowestPrint = findLowestPrint(ownersList);
                
                if (page === 0) {
                    const makerMentions = (cardDetails.makers || []).map(maker => `<@${maker}>`).join(' ') || 'No makers listed';
                    const embed = new EmbedBuilder()
                        .setTitle(`${cardDetails.tier} | ${cardDetails.name} ${eventMark}`)
                        .setDescription(`**Series:** ${eventMark}*${cardDetails.series}*\n**Makers:** ${makerMentions}`);

                    const userOwnership = ownerCounts[interaction.user.id];
                    const versionsStringPage1 = userOwnership ? 
                        formatVersionsDisplay(userOwnership.versions) : 
                        '`You dont own any version`';
                    
                    if (userOwnership) {
                        embed.addFields({ 
                            name: `Your Copies (${userOwnership.versions.length})`, 
                            value: versionsStringPage1
                        });
                    }

                    if (userOwnership && userOwnership.versions.length > 20) {
                        embed.setThumbnail(cardImageUrl);
                    } else {
                        embed.setImage(cardImageUrl);
                    }

                    const totalPrints = ownersList.reduce((acc, owner) => acc + owner.versionCount, 0);
                    embed.setFooter({ text: `${totalPrints} total prints | ${ownersList.length} total owners | LP ${lowestPrint}` });
                    return embed;
                } else {
                    const startIdx = (page - 1) * ITEMS_PER_PAGE;
                    const pageOwners = ownersList.slice(startIdx, startIdx + ITEMS_PER_PAGE);
                    
                    const ownersText = pageOwners.map(owner => {
                        let username = owner.user ? owner.user.username : owner.id;
                        username = username || owner.id;
                        const versionsString = formatVersionsDisplay(owner.versions);
                        return `🔰 *[${username}](https://mazoku.cc/user/${owner.id})* ( ${versionsString} ) **[${owner.versionCount}]**`;
                    }).join('\n');

                    const embed = new EmbedBuilder()
                        .setTitle(`${cardDetails.tier} | ${cardDetails.name} ${eventMark}Owners`)
                        .setDescription(ownersText || 'No owners found')
                        .setThumbnail(cardImageUrl)
                        .setFooter({ text: `Page ${page}/${Math.min(totalPages - 1, 24)}` });

                    return embed;
                }
            };

            const generateSelectMenu = () => {
                const options = [{
                    label: 'Card Details',
                    description: 'View card information and your copies',
                    value: 'details'
                }];

                const numOwnerPages = Math.min(Math.ceil(ownersList.length / ITEMS_PER_PAGE), 24);
                for (let i = 0; i < numOwnerPages && options.length < 25; i++) {
                    const startIdx = i * ITEMS_PER_PAGE + 1;
                    const endIdx = Math.min((i + 1) * ITEMS_PER_PAGE, ownersList.length);
                    
                    options.push({
                        label: `Owners Page ${i + 1}`,
                        description: `View owners ${startIdx}-${endIdx}`,
                        value: `page_${i + 1}`
                    });
                }

                return new ActionRowBuilder()
                    .addComponents(
                        new StringSelectMenuBuilder()
                            .setCustomId('pageSelect')
                            .setPlaceholder('Select a page')
                            .addOptions(options)
                    );
            };

            const initialMessage = await interaction.editReply({
                embeds: [generateEmbed(currentPage)],
                components: [generateSelectMenu()]
            });

            const collector = initialMessage.createMessageComponentCollector({
                componentType: ComponentType.StringSelect,
                time: 600000
            });

            collector.on('collect', async i => {
                if (i.user.id !== interaction.user.id) {
                    return await i.reply({ content: 'This menu is not for you!', ephemeral: true });
                }

                const selectedValue = i.values[0];
                currentPage = selectedValue === 'details' ? 0 : parseInt(selectedValue.split('_')[1]);

                await i.update({
                    embeds: [generateEmbed(currentPage)],
                    components: [generateSelectMenu()]
                });
            });

            collector.on('end', async () => {
                const disabledMenu = generateSelectMenu();
                disabledMenu.components[0].setDisabled(true);
                await initialMessage.edit({ components: [disabledMenu] }).catch(() => {});
            });

        } catch (error) {
            console.error('Error executing search command:', error);
            await interaction.editReply('Character not found.');
        }
    }
};
