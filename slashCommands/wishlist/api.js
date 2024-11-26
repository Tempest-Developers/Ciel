const { CARDS_PER_PAGE } = require('./constants');
let allCards;

try {
    allCards = require('../../assets/all-cards-mazoku.json');
} catch (error) {
    console.error('Failed to load Mazoku card data:', error);
    throw new Error("Mazoku Servers unavailable");
}

// Function to handle data lookup errors
const handleDataLookup = (operation) => {
    try {
        if (!allCards) {
            throw new Error("Mazoku Servers unavailable");
        }
        const result = operation();
        return result;
    } catch (error) {
        console.error('Data lookup error:', error);
        throw new Error("Mazoku Servers unavailable");
    }
};

const fetchCardDetails = async (cardId) => {
    try {
        if (!allCards) {
            throw new Error("Mazoku Servers unavailable");
        }

        const card = handleDataLookup(() => 
            allCards.find(card => card.id === cardId)
        );
        
        if (!card) {
            return {
                name: '*Data Unavailable*',
                series: '*Data Unavailable*',
                tier: 'Unknown',
                makers: []
            };
        }

        return {
            ...card,
            name: card.name || '*Data Unavailable*',
            series: card.series || '*Data Unavailable*',
            makers: card.makers || []
        };
    } catch (error) {
        console.error('Error fetching card details:', error);
        throw new Error("Mazoku Servers unavailable");
    }
};

const searchCards = async (searchParams, page = 1) => {
    try {
        if (!allCards || !Array.isArray(allCards)) {
            throw new Error("Mazoku Servers unavailable");
        }

        let filteredCards = [...allCards];

        // Apply filters if they exist
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

            if (searchParams.type) {
                const isEvent = searchParams.type === 'event';
                filteredCards = filteredCards.filter(card => 
                    isEvent ? card.eventType !== null : card.eventType === null
                );
            }

            // Sort cards if sort parameters exist
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

        // Map cards to ensure all required fields exist
        const mappedCards = paginatedCards.map(card => ({
            id: card.id,
            name: card.name || '*Data Unavailable*',
            series: card.series || '*Data Unavailable*',
            tier: card.tier || 'Unknown',
            eventType: card.eventType,
            createdDate: card.createdDate,
            makers: card.makers || []
        }));

        return {
            cards: mappedCards,
            totalPages,
            totalCards: filteredCards.length
        };
    } catch (error) {
        console.error('Error searching cards:', error);
        throw new Error("Mazoku Servers unavailable");
    }
};

module.exports = {
    fetchCardDetails,
    searchCards
};
