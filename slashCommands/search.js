const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType } = require('discord.js');

let cachedCards = null;
let cacheTimestamp = 0;
let cachedFilteredResults = new Map();
const CACHE_DURATION = 30000; // 30 seconds cache
const MIN_SEARCH_LENGTH = 2; // Minimum characters before searching

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
            
            // Return empty array for short inputs
            if (focusedValue.length < MIN_SEARCH_LENGTH) {
                return await interaction.respond([]);
            }

            // Check if we have cached results for this search
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
                    name: `${card.tier} | ${card.name}`,
                    value: card.id
                }))
                .slice(0, 25);

            // Cache the filtered results
            cachedFilteredResults.set(focusedValue, filtered);

            // Clear old cached results
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
        await interaction.deferReply();
        
        try {
            const cardId = interaction.options.getString('card');
            
            // Get card owners
            const ownersResponse = await fetch(`https://api.mazoku.cc/api/get-inventory-items-by-card/${cardId}`);
            if (!ownersResponse.ok) {
                throw new Error('Failed to fetch card owners');
            }
            const owners = await ownersResponse.json();

            // Get card details from cache or fetch if needed
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

            // Group owners by user to count versions
            const ownerCounts = owners.reduce((acc, item) => {
                const ownerId = item.owner;
                if (!acc[ownerId]) {
                    acc[ownerId] = {
                        user: item.user,
                        versions: []
                    };
                }
                acc[ownerId].versions.push(item.version);
                return acc;
            }, {});

            const ownersList = Object.entries(ownerCounts).map(([ownerId, data]) => ({
                id: ownerId,
                user: data.user,
                versionCount: data.versions.length,
                versions: data.versions
            }));

            const ITEMS_PER_PAGE = 10;
            const totalPages = Math.ceil(ownersList.length / ITEMS_PER_PAGE) + 1; // +1 for the card details page
            let currentPage = 0;
            
            const generateEmbed = (page) => {
                const cardImageUrl = `https://cdn.mazoku.cc/packs/${cardId}`;
                
                if (page === 0) {
                    // First page shows card details and user's copies
                    const embed = new EmbedBuilder()
                        .setTitle(`${cardDetails.tier} | ${cardDetails.name}`)
                        .setDescription(`Series: ${cardDetails.series}`)
                        .setImage(cardImageUrl);

                    // Show user's copies if they own any
                    const userOwnership = ownerCounts[interaction.user.id];
                    const versionsStringPage1 = userOwnership?userOwnership.versions.map(version => `\`${version}\``).join(' '):'\`You dont own any version\`';
                    if (userOwnership) {
                        embed.addFields({ 
                            name: `Your Copies (${userOwnership.versions.length})`, 
                            value: versionsStringPage1
                        });
                    }

                    embed.setFooter({ text: `Card Details | ${ownersList.length} total owners` });
                    return embed;
                } else {
                    // Subsequent pages show version owners
                    const startIdx = (page - 1) * ITEMS_PER_PAGE;
                    const pageOwners = ownersList.slice(startIdx, startIdx + ITEMS_PER_PAGE);
                    
                    const ownersText = pageOwners.map(owner => {
                        let username = owner.user ? owner.user.username : owner.id;
                        username = username == "" ? owner.id : username;
                        const versionsString = owner.versions.map(version => `\`${version}\``).join(' ');
                        return `🔰 *[${username}](https://mazoku.cc/user/${owner.id})* - **${owner.versionCount}** ${owner.versionCount !== 1 ? 's' : ''} ( ${versionsString} )`;

                    }).join('\n');

                    const embed = new EmbedBuilder()
                        .setTitle(`${cardDetails.name} Owners`)
                        .setDescription(ownersText || 'No owners found')
                        .setThumbnail(cardImageUrl)
                        .setFooter({ text: `Page ${page}/${totalPages - 1}` });

                    return embed;
                }
            };

            const generateSelectMenu = () => {
                const options = [];
                
                // Add card details option
                options.push({
                    label: 'Card Details',
                    description: 'View card information and your copies',
                    value: 'details'
                });

                // Add owner list pages
                const numOwnerPages = Math.ceil(ownersList.length / ITEMS_PER_PAGE);
                for (let i = 0; i < numOwnerPages; i++) {
                    const startIdx = i * ITEMS_PER_PAGE + 1;
                    const endIdx = Math.min((i + 1) * ITEMS_PER_PAGE, ownersList.length);
                    
                    // Ensure we don't exceed Discord's 25-option limit
                    if (options.length >= 25) break;
                    
                    options.push({
                        label: `Owners Page ${i + 1}`,
                        description: `View owners ${startIdx}-${endIdx}`,
                        value: `page_${i + 1}`
                    });
                }

                const row = new ActionRowBuilder()
                    .addComponents(
                        new StringSelectMenuBuilder()
                            .setCustomId('pageSelect')
                            .setPlaceholder('Select a page')
                            .addOptions(options)
                    );

                return row;
            };

            const initialMessage = await interaction.editReply({
                embeds: [generateEmbed(currentPage)],
                components: [generateSelectMenu()]
            });

            const collector = initialMessage.createMessageComponentCollector({
                componentType: ComponentType.StringSelect,
                time: 600000 // 10 minutes
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
