const { wrapDbOperation, connectDB } = require('./connection');

async function createGiveaway(userID, itemID, level, amount, endTimestamp) {
    return wrapDbOperation(async () => {
        const { mGiveawayDB } = await connectDB();
        const lastGiveaway = await mGiveawayDB.findOne({}, { sort: { giveawayID: -1 } });
        const giveawayID = lastGiveaway ? lastGiveaway.giveawayID + 1 : 0;

        return await mGiveawayDB.insertOne({
            giveawayID,
            userID,
            itemID,
            createdAt: new Date(),
            endTimestamp,
            level,
            amount,
            active: true,
            users: [],
            logs: []
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

async function joinGiveaway(giveawayID, userID, ticketAmount) {
    return wrapDbOperation(async () => {
        const { mGateDB, mGiveawayDB } = await connectDB();
        
        // Get user's ticket balance
        const userData = await mGateDB.findOne({ userID });
        if (!userData) {
            throw new Error('User not found');
        }

        const userTickets = userData.currency[5] || 0;
        if (userTickets < ticketAmount) {
            throw new Error('Not enough tickets');
        }

        // Get giveaway data
        const giveaway = await mGiveawayDB.findOne({ giveawayID });
        if (!giveaway || !giveaway.active) {
            throw new Error('Giveaway not found or not active');
        }

        // Check if user already joined
        if (giveaway.users.some(user => user.userID === userID)) {
            throw new Error('User has already joined this giveaway');
        }

        // Start a session for atomic operations
        const session = mGateDB.client.startSession();
        try {
            await session.withTransaction(async () => {
                // Deduct tickets from user
                await mGateDB.updateOne(
                    { userID },
                    { $inc: { 'currency.5': -ticketAmount } },
                    { session }
                );

                // Add user to giveaway
                await mGiveawayDB.updateOne(
                    { giveawayID },
                    { 
                        $push: { 
                            users: { userID, amount_tickets: ticketAmount },
                            logs: { userID, timestamp: new Date(), tickets: ticketAmount }
                        }
                    },
                    { session }
                );
            });
        } finally {
            await session.endSession();
        }

        return true;
    });
}

module.exports = {
    createGiveaway,
    getGiveaways,
    getGiveaway,
    updateGiveawayTimestamp,
    joinGiveaway
};
