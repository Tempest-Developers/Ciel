const { wrapDbOperation, connectDB } = require('./connection');

async function addToWishlist(userId, cardId) {
    return wrapDbOperation(async () => {
        const { mCardWishlistDB, mUserWishlistDB } = await connectDB();
        try {
            // Update card wishlist
            const cardResult = await mCardWishlistDB.findOneAndUpdate(
                { cardId },
                {
                    $set: { [`userWishes.${userId}`]: true },
                    $inc: { count: 1 }
                },
                { 
                    upsert: true,
                    returnDocument: 'after'
                }
            );

            // Update user wishlist
            const userResult = await mUserWishlistDB.findOneAndUpdate(
                { userId },
                {
                    $addToSet: { cardIds: cardId },
                    $inc: { count: 1 }
                },
                { 
                    upsert: true,
                    returnDocument: 'after'
                }
            );

            return cardResult !== null && userResult !== null;
        } catch (error) {
            console.error('Error adding to wishlist:', error);
            return false;
        }
    });
}

async function removeFromWishlist(userId, cardId) {
    return wrapDbOperation(async () => {
        const { mCardWishlistDB, mUserWishlistDB } = await connectDB();
        try {
            // Update card wishlist
            const cardResult = await mCardWishlistDB.findOneAndUpdate(
                { cardId },
                {
                    $set: { [`userWishes.${userId}`]: false },
                    $inc: { count: -1 }
                },
                { returnDocument: 'after' }
            );

            // Update user wishlist
            const userResult = await mUserWishlistDB.findOneAndUpdate(
                { userId },
                {
                    $pull: { cardIds: cardId },
                    $inc: { count: -1 }
                },
                { returnDocument: 'after' }
            );

            // If count reaches 0, remove the card document
            if (cardResult && cardResult.count <= 0) {
                await mCardWishlistDB.deleteOne({ cardId });
            }

            // If user has no more cards, remove the user document
            if (userResult && userResult.count <= 0) {
                await mUserWishlistDB.deleteOne({ userId });
            }

            return cardResult !== null && userResult !== null;
        } catch (error) {
            console.error('Error removing from wishlist:', error);
            return false;
        }
    });
}

async function isInWishlist(userId, cardId) {
    return wrapDbOperation(async () => {
        const { mCardWishlistDB } = await connectDB();
        try {
            const wishlist = await mCardWishlistDB.findOne({ 
                cardId,
                [`userWishes.${userId}`]: true
            });
            return !!wishlist;
        } catch (error) {
            console.error('Error checking wishlist:', error);
            return false;
        }
    });
}

async function getCardWishlistCount(cardId) {
    return wrapDbOperation(async () => {
        const { mCardWishlistDB } = await connectDB();
        try {
            // If cardId is an array, fetch multiple counts
            if (Array.isArray(cardId)) {
                const cards = await mCardWishlistDB.find({ 
                    cardId: { $in: cardId } 
                }).toArray();
                
                // Create a Map of cardId to count
                const countMap = new Map();
                cards.forEach(card => {
                    countMap.set(card.cardId, card.count || 0);
                });
                
                // Ensure all requested cardIds have a count (even if 0)
                cardId.forEach(id => {
                    if (!countMap.has(id)) {
                        countMap.set(id, 0);
                    }
                });
                
                return countMap;
            } else {
                // Single cardId lookup
                const card = await mCardWishlistDB.findOne({ cardId });
                return card?.count || 0;
            }
        } catch (error) {
            console.error('Error getting card wishlist count:', error);
            return Array.isArray(cardId) ? new Map() : 0;
        }
    });
}

async function getUserWishlistCount(userId) {
    return wrapDbOperation(async () => {
        const { mUserWishlistDB } = await connectDB();
        try {
            const user = await mUserWishlistDB.findOne({ userId });
            return user?.count || 0;
        } catch (error) {
            console.error('Error getting user wishlist count:', error);
            return 0;
        }
    });
}

async function getUserWishlist(userId) {
    return wrapDbOperation(async () => {
        const { mUserWishlistDB } = await connectDB();
        try {
            const user = await mUserWishlistDB.findOne({ userId });
            return user?.cardIds || [];
        } catch (error) {
            console.error('Error getting user wishlist:', error);
            return [];
        }
    });
}

async function getCardWishers(cardId) {
    return wrapDbOperation(async () => {
        const { mCardWishlistDB } = await connectDB();
        try {
            const card = await mCardWishlistDB.findOne({ cardId });
            if (!card || !card.userWishes) return [];
            
            return Object.entries(card.userWishes)
                .filter(([_, isWishing]) => isWishing)
                .map(([userId]) => userId);
        } catch (error) {
            console.error('Error getting card wishers:', error);
            return [];
        }
    });
}

module.exports = {
    addToWishlist,
    removeFromWishlist,
    isInWishlist,
    getCardWishlistCount,
    getUserWishlistCount,
    getUserWishlist,
    getCardWishers
};
