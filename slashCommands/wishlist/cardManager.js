const db = require('../../database/mongo');
const { fetchCardDetails } = require('./api');
const { CARDS_PER_PAGE } = require('./constants');

const sortByWishlistCount = async (cards) => {
    if (!Array.isArray(cards) || cards.length === 0) return cards;
    
    // Get wishlist counts for all cards at once
    const cardIds = cards.map(card => card.id);
    const wishlistCounts = await db.getCardWishlistCount(cardIds);
    
    // Sort cards by wishlist count
    return [...cards].sort((a, b) => {
        const countA = wishlistCounts.get(a.id) || 0;
        const countB = wishlistCounts.get(b.id) || 0;
        return countB - countA; // Descending order
    });
};

const fetchAllWishlistedCards = async () => {
    try {
        // Get all cards with wishlist count
        const cards = await db.getAllCardWishlistCounts();
        if (!cards || cards.length === 0) return [];

        // Fetch details for each card
        const cardPromises = cards.map(card => fetchCardDetails(card.cardId));
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
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return cards.slice(startIndex, endIndex);
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
            isWishlisted: false
        };
    }
};

module.exports = {
    sortByWishlistCount,
    fetchAllWishlistedCards,
    paginateCards,
    toggleWishlist
};
