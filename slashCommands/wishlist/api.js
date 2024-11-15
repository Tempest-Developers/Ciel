const { CARDS_PER_PAGE } = require('./constants');
const allCards = require('../../assets/all-cards-mazoku.json');

// Function to handle data lookup errors
const handleDataLookup = (operation) => {
    try {
        const result = operation();
        return result;
    } catch (error) {
        console.log('Data lookup error:', error.message);
        throw new Error("Data unavailable");
    }
};

const fetchCardDetails = async (cardId) => {
    try {
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
        console.log('Error fetching card details:', error.message);
        return {
            name: '*Data Unavailable*',
            series: '*Data Unavailable*',
            tier: 'Unknown',
            makers: []
        };
    }
};

const searchCards = async (searchParams, page = 1) => {
    try {
        let filteredCards = [...allCards];

        // Apply filters
        if (searchParams.name) {
            const searchName = searchParams.name.toLowerCase();
            filteredCards = filteredCards.filter(card => 
                card.name.toLowerCase().includes(searchName)
            );
        }

        if (searchParams.anime) {
            const searchSeries = searchParams.anime.toLowerCase();
            filteredCards = filteredCards.filter(card => 
                card.series.toLowerCase().includes(searchSeries)
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

        // Sort cards
        const sortBy = searchParams.sortBy || "dateAdded";
        const sortOrder = searchParams.sortOrder || "desc";
        
        filteredCards.sort((a, b) => {
            let comparison = 0;
            if (sortBy === "dateAdded") {
                comparison = new Date(a.createdDate) - new Date(b.createdDate);
            } else if (sortBy === "name") {
                comparison = a.name.localeCompare(b.name);
            }
            return sortOrder === "desc" ? -comparison : comparison;
        });

        // Pagination
        const totalPages = Math.ceil(filteredCards.length / CARDS_PER_PAGE);
        const startIndex = (page - 1) * CARDS_PER_PAGE;
        const endIndex = startIndex + CARDS_PER_PAGE;
        const paginatedCards = filteredCards.slice(startIndex, endIndex);

        return {
            cards: paginatedCards.map(card => ({
                ...card,
                name: card.name || '*Data Unavailable*',
                series: card.series || '*Data Unavailable*',
                makers: card.makers || []
            })),
            totalPages: totalPages || 1
        };
    } catch (error) {
        console.log('Error searching cards:', error.message);
        return {
            cards: [],
            totalPages: 1
        };
    }
};

module.exports = {
    fetchCardDetails,
    searchCards
};
