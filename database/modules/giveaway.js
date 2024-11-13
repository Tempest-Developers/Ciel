const { wrapDbOperation, connectDB } = require('./connection');

async function createGiveaway(userID, itemDetails, level, amount, endTimestamp) {
    return wrapDbOperation(async () => {
        const { mGiveawayDB } = await connectDB();
        const lastGiveaway = await mGiveawayDB.findOne({}, { sort: { giveawayID: -1 } });
        const giveawayID = lastGiveaway ? lastGiveaway.giveawayID + 1 : 0;

        return await mGiveawayDB.insertOne({
            giveawayID,
            userID,
            item: itemDetails, // Now an object with name, imageURL, etc.
            createdAt: new Date(),
            endTimestamp,
            level,
            amount,
            active: true,
            entries: [],
            logs: [],
            winners: [] // To support multiple winners
        });
    });
}

async function getGiveaways(active = null) {
    return wrapDbOperation(async () => {
        const { mGiveawayDB } = await connectDB();
        const query = active !== null ? { active } : {};
        return await mGiveawayDB.find(query).sort({ endTimestamp: -1 }).toArray();
    });
}

async function getGiveaway(giveawayID) {
    return wrapDbOperation(async () => {
        const { mGiveawayDB } = await connectDB();
        return await mGiveawayDB.findOne({ giveawayID });
    });
}

async function updateGiveawayTimestamp(giveawayID, newTimestamp) {
    return wrapDbOperation(async () => {
        const { mGiveawayDB } = await connectDB();
        return await mGiveawayDB.updateOne(
            { giveawayID },
            { $set: { endTimestamp: newTimestamp } }
        );
    });
}

async function announceGiveaway(giveawayID, guildID, channelID) {
    return wrapDbOperation(async () => {
        const { mGiveawayDB } = await connectDB();
        const giveaway = await mGiveawayDB.findOne({ giveawayID });
        
        if (!giveaway) {
            throw new Error('Giveaway not found');
        }

        return { giveaway, guildID, channelID };
    });
}

module.exports = {
    createGiveaway,
    getGiveaways,
    getGiveaway,
    updateGiveawayTimestamp,
    announceGiveaway
};
