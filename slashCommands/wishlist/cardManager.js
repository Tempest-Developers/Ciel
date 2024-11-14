const db = require('../../database/mongo');
const { fetchCardDetails } = require('./api');
const { CARDS_PER_PAGE } = require('./constants');

const sortByWishlistCount = async (cards) => {
    if (!Array.isArray(cards) || cards.length === 0) return cards;
    
    try {
        // Get wishlist counts for all cards at once
        const cardIds = cards.map(card => card.id);
        const wishlistCounts = await db.getCardWishlistCount(cardIds);
        
        // Sort cards by wishlist count
        return [...cards].sort((a, b) => {
            const countA = wishlistCounts.get(a.id) || 0;
            const countB = wishlistCounts.get(b.id) || 0;
            return countB - countA; // Descending order
        });
    } catch (error) {
        console.error('Error sorting cards by wishlist count:', error);
        return cards; // Return unsorted cards on error
    }
};

const fetchAllWishlistedCards = async () => {
    try {
        // Get all cards with wishlist count
        const cards = await db.getAllCardWishlistCounts();
        if (!cards || cards.length === 0) return [];

        // Fetch details for each card
        const cardPromises = cards.map(async cardId => {
            try {
                return await fetchCardDetails(cardId);
            } catch (error) {
                console.error(`Error fetching card ${cardId}:`, error);
                return null;
            }
        });

        const cardDetails = await Promise.all(cardPromises);
        
        // Filter out any failed fetches
        return cardDetails.filter(card => card !== null);
    } catch (error) {
        console.error('Error fetching all wishlisted cards:', error);
        return [];
    }
};

const paginateCards = (cards, page, pageSize = CARDS_PER_PAGE) => {
    if (!Array.isArray(cards)) return [];
    
    try {
        const startIndex = (page - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        return cards.slice(startIndex, endIndex);
    } catch (error) {
        console.error('Error paginating cards:', error);
        return [];
    }
};

const toggleWishlist = async (userId, cardId) => {
    try {
        const isWishlisted = await db.isInWishlist(userId, cardId);
        let success;
        
        if (isWishlisted) {
            success = await db.removeFromWishlist(userId, cardId);
        } else {
            success = await db.addToWishlist(userId, cardId);
        }

        return {
            success,
            isWishlisted: !isWishlisted // Return the new state
        };
    } catch (error) {
        console.error('Error toggling wishlist:', error);
        return {
            success: false,
            isWishlisted: false,
            error: error.message
        };
    }
};

module.exports = {
    sortByWishlistCount,
    fetchAllWishlistedCards,
    paginateCards,
    toggleWishlist
};
