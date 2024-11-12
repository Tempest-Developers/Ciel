const ensureUser = async (userId, mGateDB) => {
    let userData = await mGateDB.findOne({ userID: userId });
    if (!userData) {
        await mGateDB.insertOne({
            userID: userId,
            currency: [0, 0, 0, 0, 0, 0], // Added 6th slot for tickets
            mission: [],
            achievements: [],
            premium: {
                active: false,
                expiresAt: null
            }
        });
        userData = await mGateDB.findOne({ userID: userId });
    } else if (!userData.premium) {
        // Update existing users to have premium field
        await mGateDB.updateOne(
            { userID: userId },
            { 
                $set: { 
                    premium: {
                        active: false,
                        expiresAt: null
                    }
                }
            }
        );
        userData = await mGateDB.findOne({ userID: userId });
    }
    return userData;
};

const getServerData = async (GATE_GUILD, mGateServerDB) => {
    let serverData = await mGateServerDB.findOne({ serverID: GATE_GUILD });
    if (!serverData) {
        await mGateServerDB.insertOne({
            serverID: GATE_GUILD,
            economyEnabled: false,
            cardTrackingEnabled: true, // Default to true for backward compatibility
            totalTokens: 0,
            mods: [],
            giveaway: []
        });
        serverData = await mGateServerDB.findOne({ serverID: GATE_GUILD });
    }
    return serverData;
};

module.exports = {
    ensureUser,
    getServerData
};
