const db = require('../../database/mongo');
const { fetchCardDetails } = require('./api');
const { CARDS_PER_PAGE } = require('./constants');

const sortByWishlistCount = async (cards, userId) => {
    if (!Array.isArray(cards) || cards.length === 0) return cards;
    
    try {
        // Get wishlist counts and user's wishlist status for all cards at once
        const cardIds = cards.map(card => card.id);
        const [wishlistCounts, userWishlistStatus] = await Promise.all([
            db.getCardWishlistCount(cardIds),
            Promise.all(cardIds.map(cardId => db.isInWishlist(userId, cardId)))
        ]);
        
        // Add wishlist info to cards
        const cardsWithWishlist = cards.map((card, index) => ({
            ...card,
            wishlistCount: wishlistCounts.get(card.id) || 0,
            isWishlisted: userWishlistStatus[index]
        }));
        
        // Sort cards by wishlist count
        return cardsWithWishlist.sort((a, b) => b.wishlistCount - a.wishlistCount);
    } catch (error) {
        console.error('Error sorting cards by wishlist count:', error);
        return cards; // Return unsorted cards on error
    }
};

const fetchAllWishlistedCards = async (userId) => {
    try {
        // Get all cards with wishlist counts
        const cardWishlistCounts = await db.getCardWishlistCount();
        if (!cardWishlistCounts || cardWishlistCounts.size === 0) return [];

        // Get user's wishlist status
        const userWishlist = await db.getUserWishlist(userId);
        const wishlistSet = new Set(userWishlist);

        // Convert to array and sort by count
        const sortedCardIds = Array.from(cardWishlistCounts.entries())
            .sort(([, countA], [, countB]) => countB - countA)
            .map(([cardId]) => cardId);

        // Fetch details for each card
        const cardPromises = sortedCardIds.map(async cardId => {
            try {
                const cardDetails = await fetchCardDetails(cardId);
                if (cardDetails) {
                    return {
                        ...cardDetails,
                        wishlistCount: cardWishlistCounts.get(cardId) || 0,
                        isWishlisted: wishlistSet.has(cardId)
                    };
                }
                return null;
            } catch (error) {
                console.error(`Error fetching card ${cardId}:`, error);
                return null;
            }
        });

        const cardDetails = await Promise.all(cardPromises);
        
        // Filter out any failed fetches and sort by wishlist count
        return cardDetails
            .filter(card => card !== null)
            .sort((a, b) => b.wishlistCount - a.wishlistCount);
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
