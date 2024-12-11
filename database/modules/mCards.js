const { wrapDbOperation, connectDB } = require('./connection');

async function cacheCardData(cardId, cardInfo) {
    return wrapDbOperation(async () => {
        const { mCardDB } = await connectDB();
        try {
            await mCardDB.updateOne(
                { cardId },
                { $set: { cardInfo, lastUpdated: new Date() } },
                { upsert: true }
            );
        } catch (error) {
            console.error('Error caching card data:', error);
        }
    });
}

async function getCachedCardData(cardId) {
    return wrapDbOperation(async () => {
        const { mCardDB } = await connectDB();
        try {
            const cachedData = await mCardDB.findOne({ cardId });
            if (cachedData && Date.now() - cachedData.lastUpdated.getTime() < 24 * 60 * 60 * 1000) {
                return cachedData.cardInfo;
            }
            return null;
        } catch (error) {
            console.error('Error getting cached card data:', error);
            return null;
        }
    });
}

module.exports = {
    cacheCardData,
    getCachedCardData
};
