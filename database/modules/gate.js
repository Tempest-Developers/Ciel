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

module.exports = {
    createGateUser,
    createGateServer
};
