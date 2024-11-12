const { wrapDbOperation, mGateDB, mGateServerDB } = require('./connection');

async function createGateUser(userID) {
    return wrapDbOperation(async () => {
        return await mGateDB.insertOne({
            userID,
            currency: [0, 0, 0, 0, 0, 0], // Added 6th slot for tickets
            mission: [],
            achievements: [],
            premium: {
                active: false,
                expiresAt: null
            }
        });
    });
}

async function createGateServer(serverID) {
    return wrapDbOperation(async () => {
        return await mGateServerDB.insertOne({
            serverID,
            economyEnabled: false,
            cardTrackingEnabled: true,
            totalTokens: 0,
            mods: [],
            giveaway: []
        });
    });
}

async function updateUserCurrency(userID, currencyIndex, amount) {
    return wrapDbOperation(async () => {
        const update = {};
        update[`currency.${currencyIndex}`] = amount;
        return await mGateDB.updateOne(
            { userID },
            { $inc: update }
        );
    });
}

async function getGateUser(userID) {
    return wrapDbOperation(async () => {
        return await mGateDB.findOne({ userID });
    });
}

module.exports = {
    createGateUser,
    createGateServer,
    updateUserCurrency,
    getGateUser
};
