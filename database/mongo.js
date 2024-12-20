const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
    // Updated connection options to use only supported options
    connectTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    maxPoolSize: 50,
    minPoolSize: 5
});

let mServerDB, mUserDB, mServerSettingsDB, mGateDB, mGateServerDB, mCommandLogsDB, mGiveawayDB;
let isConnected = false;

async function connectDB() {
    if (isConnected) {
        return { mServerDB, mUserDB, mServerSettingsDB, mGateDB, mGateServerDB, mCommandLogsDB, mGiveawayDB };
    }

    try {
        // Add connection event listeners
        client.on('serverDescriptionChanged', () => {
            console.log('MongoDB server description changed');
        });

        client.on('serverHeartbeatFailed', () => {
            console.log('MongoDB server heartbeat failed');
            isConnected = false;
            // Attempt to reconnect after a delay
            setTimeout(reconnect, 5000);
        });

        client.on('serverHeartbeatSucceeded', () => {
            // console.log('MongoDB server heartbeat succeeded');
            isConnected = true;
        });

        await client.connect();
        console.log("Connected to MongoDB!");
        isConnected = true;

        mServerDB = client.db('MainDB').collection('mServerDB');
        mUserDB = client.db('MainDB').collection('mUserDB');
        mServerSettingsDB = client.db('MainDB').collection('mServerSettingsDB');
        mGateDB = client.db('MainDB').collection('mGateDB');
        mGateServerDB = client.db('MainDB').collection('mGateServerDB');
        mCommandLogsDB = client.db('MainDB').collection('mCommandLogsDB');
        mGiveawayDB = client.db('MainDB').collection('mGiveawayDB');

        // Create indexes for unique fields
        await mServerDB.createIndex({ serverID: 1 }, { unique: true });
        await mUserDB.createIndex({ userID: 1, serverID: 1 }, { unique: true });
        await mServerSettingsDB.createIndex({ serverID: 1 }, { unique: true });
        await mGateDB.createIndex({ userID: 1 }, { unique: true });
        await mGateServerDB.createIndex({ serverID: 1 }, { unique: true });
        await mGiveawayDB.createIndex({ giveawayID: 1 }, { unique: true });

        // Create index for command logs
        await mCommandLogsDB.createIndex({ serverID: 1 });
        await mCommandLogsDB.createIndex({ timestamp: 1 });

        // Create index for giveaway timestamps
        await mGiveawayDB.createIndex({ endTimestamp: 1 });
        await mGiveawayDB.createIndex({ active: 1 });

        // Create compound indexes for claims to prevent duplicates
        const tiers = ['CT', 'RT', 'SRT', 'SSRT', 'URT', 'EXT'];
        for (const tier of tiers) {
            // Server claim indexes
            await mServerDB.createIndex({
                [`claims.${tier}.claimedID`]: 1,
                [`claims.${tier}.cardID`]: 1,
                [`claims.${tier}.timestamp`]: 1
            });
            
            // User claim indexes
            await mUserDB.createIndex({
                [`claims.${tier}.claimedID`]: 1,
                [`claims.${tier}.cardID`]: 1,
                [`claims.${tier}.timestamp`]: 1
            });
        }

        // Index for manual claims
        await mUserDB.createIndex({
            "manualClaims.claimedID": 1,
            "manualClaims.cardID": 1,
            "manualClaims.timestamp": 1
        });

        // Update existing gate users to have 6 currency slots and premium field
        await mGateDB.updateMany(
            { 
                $or: [
                    { 'currency.5': { $exists: false } },
                    { premium: { $exists: false } }
                ]
            },
            {
                $set: {
                    'premium.active': false,
                    'premium.expiresAt': null
                },
                $push: {
                    currency: { $each: [0], $slice: 6 }
                }
            }
        );

        // Update existing giveaways to use endTimestamp instead of timestamp
        await mGiveawayDB.updateMany(
            { endTimestamp: { $exists: false }, timestamp: { $exists: true } },
            [{
                $set: {
                    endTimestamp: "$timestamp",
                    createdAt: new Date(),
                    timestamp: "$$REMOVE"
                }
            }]
        );

        return { mServerDB, mUserDB, mServerSettingsDB, mGateDB, mGateServerDB, mCommandLogsDB, mGiveawayDB };
    } catch (err) {
        console.error('Error connecting to MongoDB:', err);
        isConnected = false;
        // Attempt to reconnect after a delay
        setTimeout(reconnect, 5000);
        throw err;
    }
}

async function reconnect() {
    if (!isConnected) {
        try {
            await connectDB();
        } catch (err) {
            console.error('Reconnection attempt failed:', err);
        }
    }
}

// Wrap database operations in error handling
async function wrapDbOperation(operation) {
    try {
        if (!isConnected) {
            await connectDB();
        }
        return await operation();
    } catch (error) {
        console.error('Database operation error:', error);
        throw error;
    }
}

async function createGiveaway(userID, itemID, level, amount, endTimestamp) {
    return wrapDbOperation(async () => {
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
        const query = active !== null ? { active } : {};
        return await mGiveawayDB.find(query).sort({ endTimestamp: -1 }).toArray();
    });
}

async function getGiveaway(giveawayID) {
    return wrapDbOperation(async () => {
        return await mGiveawayDB.findOne({ giveawayID });
    });
}

async function updateGiveawayTimestamp(giveawayID, newTimestamp) {
    return wrapDbOperation(async () => {
        return await mGiveawayDB.updateOne(
            { giveawayID },
            { $set: { endTimestamp: newTimestamp } }
        );
    });
}

async function joinGiveaway(giveawayID, userID, ticketAmount) {
    return wrapDbOperation(async () => {
        return await mGiveawayDB.updateOne(
            { giveawayID },
            { 
                $push: { 
                    users: { userID, amount_tickets: ticketAmount },
                    logs: { userID, timestamp: new Date() }
                }
            }
        );
    });
}

async function logCommand(userID, username, serverID, serverName, commandName, options = {}) {
    return wrapDbOperation(async () => {
        try {
            return await mCommandLogsDB.insertOne({
                userID,
                username,
                serverID,
                serverName,
                commandName,
                options,
                timestamp: new Date()
            });
        } catch (error) {
            console.error('Error logging command:', error);
        }
    });
}

async function getCommandLogs(serverID = null, page = 1, limit = 10) {
    return wrapDbOperation(async () => {
        try {
            const query = serverID ? { serverID } : {};
            const skip = (page - 1) * limit;
            
            const logs = await mCommandLogsDB
                .find(query)
                .sort({ timestamp: -1 })
                .skip(skip)
                .limit(limit)
                .toArray();
                
            const total = await mCommandLogsDB.countDocuments(query);
            const totalPages = Math.ceil(total / limit);
            
            return {
                logs,
                currentPage: page,
                totalPages,
                totalLogs: total
            };
        } catch (error) {
            console.error('Error getting command logs:', error);
            throw error;
        }
    });
}

async function createServer(serverID) {
    return wrapDbOperation(async () => {
        return await mServerDB.insertOne({
            serverID,
            counts: [0, 0, 0, 0, 0, 0],
            claims: {
                CT: [],
                RT: [],
                SRT: [],
                SSRT: [],
                URT: [],
                EXT: []
            },
            pingUser: []
        });
    });
}

async function createServerSettings(serverID) {
    return wrapDbOperation(async () => {
        try {
            const existingSettings = await mServerSettingsDB.findOne({ serverID });
            if (existingSettings) {
                return await mServerSettingsDB.updateOne(
                    { serverID },
                    {
                        $set: {
                            serverID,
                            register: false,
                            premier: false,
                            settings: {
                                allowShowStats: true,
                                allowRolePing: false
                            },
                            userPing: []
                        }
                    }
                );
            } else {
                return await mServerSettingsDB.insertOne({
                    serverID,
                    register: false,
                    premier: false,
                    settings: {
                        allowShowStats: true,
                        allowRolePing: false
                    },
                    userPing: []
                });
            }
        } catch (error) {
            console.error('Error creating server settings:', error);
            throw error;
        }
    });
}

async function toggleRegister(serverID) {
    return wrapDbOperation(async () => {
        try {
            const serverSettings = await mServerSettingsDB.findOne({ serverID });

            if (!serverSettings) {
                throw new Error('Server settings not found');
            }

            const newRegisterValue = true;

            await mServerSettingsDB.updateOne(
                { serverID },
                { $set: { register: newRegisterValue } }
            );

            return { serverID, register: newRegisterValue };
        } catch (error) {
            console.error('Error toggling register:', error);
            throw error;
        }
    });
}

async function createPlayer(userID, serverID) {
    return wrapDbOperation(async () => {
        return await mUserDB.insertOne({
            userID,
            serverID,
            counts: [0, 0, 0, 0, 0, 0],
            claims: {
                CT: [],
                RT: [],
                SRT: [],
                SSRT: [],
                URT: [],
                EXT: []
            },
            manualClaims: []
        });
    });
}

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

async function addClaim(serverID, userID, claim) {
    return wrapDbOperation(async () => {
        const claimData = {
            claimedID: claim.claimedID,
            userID,
            serverID,
            cardName: claim.cardName,
            cardID: claim.cardID,
            owner: claim.owner,
            artist: claim.artist,
            print: claim.print,
            tier: claim.tier,
            timestamp: claim.timestamp
        };

        const serverUpdate = await mServerDB.findOneAndUpdate(
            { 
                serverID,
                [`claims.${claim.tier}`]: {
                    $not: {
                        $elemMatch: {
                            claimedID: claim.claimedID,
                            cardID: claim.cardID,
                            timestamp: claim.timestamp
                        }
                    }
                }
            },
            {
                $push: {
                    [`claims.${claim.tier}`]: {
                        $each: [claimData],
                        $slice: -24
                    }
                },
                $inc: { [`counts.${getTierIndex(claim.tier)}`]: 1 }
            }
        );

        const userUpdate = await mUserDB.findOneAndUpdate(
            {
                userID,
                serverID,
                [`claims.${claim.tier}`]: {
                    $not: {
                        $elemMatch: {
                            claimedID: claim.claimedID,
                            cardID: claim.cardID,
                            timestamp: claim.timestamp
                        }
                    }
                }
            },
            {
                $push: {
                    [`claims.${claim.tier}`]: {
                        $each: [claimData],
                        $slice: -24
                    }
                },
                $inc: { [`counts.${getTierIndex(claim.tier)}`]: 1 }
            }
        );

        return { 
            claimData, 
            updated: serverUpdate.lastErrorObject?.n > 0 || userUpdate.lastErrorObject?.n > 0 
        };
    });
}

async function addManualClaim(serverID, userID, claim) {
    return wrapDbOperation(async () => {
        const claimData = {
            claimedID: claim.claimedID,
            userID,
            serverID,
            cardName: claim.cardName,
            cardID: claim.cardID,
            owner: claim.owner,
            artist: claim.artist,
            print: claim.print,
            tier: claim.tier,
            timestamp: claim.timestamp
        };

        const userUpdate = await mUserDB.findOneAndUpdate(
            {
                userID,
                serverID,
                manualClaims: {
                    $not: {
                        $elemMatch: {
                            claimedID: claim.claimedID,
                            cardID: claim.cardID,
                            timestamp: claim.timestamp
                        }
                    }
                }
            },
            {
                $push: {
                    manualClaims: {
                        $each: [claimData],
                        $slice: -48
                    }
                },
                $inc: { [`counts.${getTierIndex(claim.tier)}`]: 1 }
            }
        );

        return { 
            claimData, 
            updated: userUpdate.lastErrorObject?.n > 0 
        };
    });
}

async function getServerData(serverID) {
    return wrapDbOperation(async () => {
        return await mServerDB.findOne({ serverID });
    });
}

async function getPlayerData(userID, serverID) {
    return wrapDbOperation(async () => {
        return await mUserDB.findOne({ userID, serverID });
    });
}

async function getServerSettings(serverID) {
    return wrapDbOperation(async () => {
        return await mServerSettingsDB.findOne({ serverID });
    });
}

function getTierIndex(tier) {
    const tiers = ['CT', 'RT', 'SRT', 'SSRT', 'URT', 'EXT'];
    return tiers.indexOf(tier);
}

// Graceful shutdown
process.on('SIGINT', async () => {
    try {
        await client.close();
        console.log('MongoDB connection closed through app termination');
        process.exit(0);
    } catch (err) {
        console.error('Error during shutdown:', err);
        process.exit(1);
    }
});

module.exports = {
    connectDB,
    createServer,
    createServerSettings,
    createPlayer,
    createGateUser,
    createGateServer,
    addClaim,
    addManualClaim,
    getServerData,
    getPlayerData,
    getServerSettings,
    toggleRegister,
    logCommand,
    getCommandLogs,
    createGiveaway,
    getGiveaways,
    getGiveaway,
    updateGiveawayTimestamp,
    joinGiveaway,
    // Export database collections
    mServerDB,
    mUserDB,
    mServerSettingsDB,
    mGateDB,
    mGateServerDB,
    mCommandLogsDB,
    mGiveawayDB
};
