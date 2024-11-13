const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

// Utility constants
const COOLDOWN_DURATION = 30000;
const CACHE_DURATION = 30000;
const MIN_SEARCH_LENGTH = 2;
const EVENT_EMOJI = '🎃 ';
const MAX_SERIES_LENGTH = 30;
const MAX_VERSIONS_DISPLAY = 15;
const ITEMS_PER_PAGE = 10;

// Cache and cooldown management
const cooldowns = new Map();
const rateLimit = new Map();
let cachedCards = null;
let cacheTimestamp = 0;
let cachedFilteredResults = new Map();

// Utility functions
const formatSeriesName = (series) => {
    return series.length > MAX_SERIES_LENGTH ? 
        series.substring(0, MAX_SERIES_LENGTH - 3) + '...' : 
        series;
};

const formatCardSuggestion = (card) => {
    const eventMark = card.eventType ? EVENT_EMOJI : '';
    const series = formatSeriesName(card.series);
    return `${card.tier} | ${card.name} ${eventMark}(${series})`;
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
    return lowest === Infinity ? 'N/A' : lowest;
};

const formatVersionsDisplay = (versions) => {
    if (versions.length <= MAX_VERSIONS_DISPLAY) {
        return versions.map(version => `\`${version === 0 ? 'CM' : version}\``).join(' ');
    }
    const displayVersions = versions.slice(0, MAX_VERSIONS_DISPLAY);
    return `${displayVersions.map(version => `\`${version === 0 ? 'CM' : version}\``).join(' ')} +${versions.length - MAX_VERSIONS_DISPLAY} more`;
};

const fetchWithTimeout = async (url, timeout = 2500) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
};

const isRateLimited = (userId) => {
    const lastRequest = rateLimit.get(userId);
    const now = Date.now();
    if (lastRequest && now - lastRequest < 1000) return true;
    rateLimit.set(userId, now);
    return false;
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
            if (isRateLimited(interaction.user.id)) {
                return await interaction.respond([]);
            }

            const focusedValue = interaction.options.getFocused().toLowerCase();
            if (focusedValue.length < MIN_SEARCH_LENGTH) {
                return await interaction.respond([]);
            }

            const cachedResult = cachedFilteredResults.get(focusedValue);
            if (cachedResult) {
                return await interaction.respond(cachedResult);
            }
            Explain
            const now = Date.now();
            let cards;

            try {
                if (cachedCards && now - cacheTimestamp < CACHE_DURATION) {
                    cards = cachedCards;
                } else {
                    const response = await fetchWithTimeout('https://api.mazoku.cc/api/all-cards');
                    if (!response.ok) throw new Error('Failed to fetch cards');
                    
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
                console.error('Error in autocomplete:', error);
                await interaction.respond([]);
            }
        } catch (error) {
            console.error('Failed to respond to autocomplete:', error);
        }
    },

    async execute(interaction) {
        try {
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

            cooldowns.set(user.id, Date.now() + COOLDOWN_DURATION);
            setTimeout(() => cooldowns.delete(user.id), COOLDOWN_DURATION);

            await interaction.deferReply();
            
            const cardId = interaction.options.getString('card');
            
            const [ownersResponse, cardResponse] = await Promise.all([
                fetchWithTimeout(`https://api.mazoku.cc/api/get-inventory-items-by-card/${cardId}`),
                !cachedCards && fetchWithTimeout('https://api.mazoku.cc/api/all-cards')
            ]);

            if (!ownersResponse.ok) {
                throw new Error('Failed to fetch card owners');
            }

            const owners = await ownersResponse.ok ? await ownersResponse.json() : [];
            
            let cardDetails;
            if (cachedCards) {
                cardDetails = cachedCards.find(card => card.id === cardId);
            } else if (cardResponse) {
                const cards = await cardResponse.json();
                cardDetails = cards.find(card => card.id === cardId);
                cachedCards = cards;
                cacheTimestamp = Date.now();
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

            Object.values(ownerCounts).forEach(owner => {
                owner.versions = sortVersions(owner.versions);
            });

            const ownersList = Object.entries(ownerCounts)
            Explain
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

        const cardImageUrl = `https://cdn.mazoku.cc/packs/${cardId}`;
        const eventMark = cardDetails.eventType ? EVENT_EMOJI : '';
        const lowestPrint = findLowestPrint(ownersList);
        
        const makerMentions = (cardDetails.makers || [])
            .map(maker => `<@${maker}>`)
            .join(' ') || 'No makers listed';

        const embed = new EmbedBuilder()
            .setTitle(`${cardDetails.tier} | ${cardDetails.name} ${eventMark}`)
            .setDescription(`**Series:** ${eventMark}*${cardDetails.series}*\n**Makers:** ${makerMentions}`);

        const userOwnership = ownerCounts[interaction.user.id];
        if (userOwnership) {
            const versionsString = formatVersionsDisplay(userOwnership.versions);
            embed.addFields({ 
                name: `Your Copies (${userOwnership.versions.length})`, 
                value: versionsString
            });
        }

        if (userOwnership && userOwnership.versions.length > 20) {
            embed.setThumbnail(cardImageUrl);
        } else {
            embed.setImage(cardImageUrl);
        }

        const totalPrints = ownersList.reduce((acc, owner) => acc + owner.versionCount, 0);
        embed.setFooter({ 
            text: `${totalPrints} total prints | ${ownersList.length} total owners | LP ${lowestPrint}`
        });

        // Create owners list field
        const ownersPerPage = 10;
        const firstPageOwners = ownersList.slice(0, ownersPerPage);
        
        if (firstPageOwners.length > 0) {
            const ownersText = firstPageOwners
                .map(owner => {
                    const username = owner.user ? owner.user.username : owner.id;
                    const versionsString = formatVersionsDisplay(owner.versions);
                    return `🔰 *[${username}](https://mazoku.cc/user/${owner.id})* ( ${versionsString} ) **[${owner.versionCount}]**`;
                })
                .join('\n');

            embed.addFields({
                name: 'Owners',
                value: ownersText
            });

            if (ownersList.length > ownersPerPage) {
                embed.addFields({
                    name: 'Additional Owners',
                    value: `*and ${ownersList.length - ownersPerPage} more owners...*`
                });
            }
        }

        await interaction.editReply({ embeds: [embed] });

    } catch (error) {
        console.error('Error in execute:', error);
        const errorMessage = 'An error occurred while processing your request. Please try again later.';
        if (interaction.deferred) {
            await interaction.editReply({ content: errorMessage });
        } else {
            await interaction.reply({ content: errorMessage, ephemeral: true });
        }
    }
}
};