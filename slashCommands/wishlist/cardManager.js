const db = require('../../database/mongo');
const { fetchCardDetails } = require('./api');
const { CARDS_PER_PAGE } = require('./constants');
const { wrapDbOperation, connectDB } = require('../../database/modules/connection');

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
    return wrapDbOperation(async () => {
        const { mCardWishlistDB } = await connectDB();
        try {
            // Get all cards from mCardWishlistDB with count > 0
            const wishlistedCards = await mCardWishlistDB.find({ count: { $gt: 0 } })
                .sort({ count: -1 })
                .toArray();

            if (!wishlistedCards || wishlistedCards.length === 0) return [];

            // Get user's wishlist status
            const userWishlist = await db.getUserWishlist(userId);
            const wishlistSet = new Set(userWishlist);

            // Fetch details for each card
            const cardPromises = wishlistedCards.map(async wishlistDoc => {
                try {
                    const cardDetails = await fetchCardDetails(wishlistDoc.cardId);
                    if (cardDetails) {
                        return {
                            ...cardDetails,
                            wishlistCount: wishlistDoc.count,
                            isWishlisted: wishlistSet.has(wishlistDoc.cardId)
                        };
                    }
                    return null;
                } catch (error) {
                    // If we get the server unavailable error, propagate it immediately
                    if (error.message === "Mazoku Servers unavailable") {
                        throw error;
                    }
                    console.error(`Error fetching card ${wishlistDoc.cardId}:`, error);
                    return null;
                }
            });

            try {
                const cardDetails = await Promise.all(cardPromises);
                // Filter out any failed fetches
                return cardDetails.filter(card => card !== null);
            } catch (error) {
                // Re-throw "Mazoku Servers unavailable" error
                if (error.message === "Mazoku Servers unavailable") {
                    throw error;
                }
                console.error('Error in Promise.all:', error);
                return [];
            }
        } catch (error) {
            // Re-throw "Mazoku Servers unavailable" error
            if (error.message === "Mazoku Servers unavailable") {
                throw error;
            }
            console.error('Error fetching all wishlisted cards:', error);
            return [];
        }
    });
};

const fetchUserWishlistedCards = async (userId) => {
    try {
        // Get user's wishlisted card IDs
        const cardIds = await db.getUserWishlist(userId);
        if (!cardIds || cardIds.length === 0) return [];

        // Get global wishlist counts for these cards
        const wishlistCounts = await db.getCardWishlistCount(cardIds);

        // Fetch details for each card
        const cardPromises = cardIds.map(async cardId => {
            try {
                const cardDetails = await fetchCardDetails(cardId);
                if (cardDetails) {
                    return {
                        ...cardDetails,
                        wishlistCount: wishlistCounts.get(cardId) || 0,
                        isWishlisted: true // These are all from user's wishlist
                    };
                }
                return null;
            } catch (error) {
                // If we get the server unavailable error, propagate it immediately
                if (error.message === "Mazoku Servers unavailable") {
                    throw error;
                }
                console.error(`Error fetching card ${cardId}:`, error);
                return null;
            }
        });

        try {
            const cardDetails = await Promise.all(cardPromises);
            // Filter out any failed fetches and sort by wishlist count
            return cardDetails
                .filter(card => card !== null)
                .sort((a, b) => b.wishlistCount - a.wishlistCount);
        } catch (error) {
            // Re-throw "Mazoku Servers unavailable" error
            if (error.message === "Mazoku Servers unavailable") {
                throw error;
            }
            console.error('Error in Promise.all:', error);
            return [];
        }
    } catch (error) {
        // Re-throw "Mazoku Servers unavailable" error
        if (error.message === "Mazoku Servers unavailable") {
            throw error;
        }
        console.error('Error fetching user wishlisted cards:', error);
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
    fetchUserWishlistedCards,
    paginateCards,
    toggleWishlist
};
