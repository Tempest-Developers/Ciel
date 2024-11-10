const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

let mServerDB, mUserDB, mServerSettingsDB, mGateDB, mGateServerDB, mCommandLogsDB;

async function connectDB() {
    try {
        await client.connect();
        console.log("Connected to MongoDB!");

        mServerDB = client.db('MainDB').collection('mServerDB');
        mUserDB = client.db('MainDB').collection('mUserDB');
        mServerSettingsDB = client.db('MainDB').collection('mServerSettingsDB');
        mGateDB = client.db('MainDB').collection('mGateDB');
        mGateServerDB = client.db('MainDB').collection('mGateServerDB');
        mCommandLogsDB = client.db('MainDB').collection('mCommandLogsDB');

        // Create indexes for unique fields
        await mServerDB.createIndex({ serverID: 1 }, { unique: true });
        await mUserDB.createIndex({ userID: 1, serverID: 1 }, { unique: true });
        await mServerSettingsDB.createIndex({ serverID: 1 }, { unique: true });
        await mGateDB.createIndex({ userID: 1 }, { unique: true });
        await mGateServerDB.createIndex({ serverID: 1 }, { unique: true });

        // Create index for command logs
        await mCommandLogsDB.createIndex({ serverID: 1 });
        await mCommandLogsDB.createIndex({ timestamp: 1 });

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

        return { mServerDB, mUserDB, mServerSettingsDB, mGateDB, mGateServerDB, mCommandLogsDB };
    } catch (err) {
        console.error('Error connecting to MongoDB:', err);
        throw err;
    }
}

async function logCommand(userID, username, serverID, serverName, commandName, options = {}) {
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
}

async function getCommandLogs(serverID = null, page = 1, limit = 10) {
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
}

async function createServer(serverID) {
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
}

async function createServerSettings(serverID) {
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
}

async function toggleRegister(serverID) {
    try {
        const serverSettings = await mServerSettingsDB.findOne({ serverID });

        if (!serverSettings) {
            throw new Error('Server settings not found');
        }

        const newRegisterValue = true;//!serverSettings.register;

        await mServerSettingsDB.updateOne(
            { serverID },
            { $set: { register: newRegisterValue } }
        );

        return { serverID, register: newRegisterValue };
    } catch (error) {
        console.error('Error toggling register:', error);
        throw error;
    }
}

async function createPlayer(userID, serverID) {
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
}

async function createGateUser(userID) {
    return await mGateDB.insertOne({
        userID,
        currency: [0, 0, 0, 0, 0],
        mission: [],
        achievements: []
    });
}

async function createGateServer(serverID) {
    return await mGateServerDB.insertOne({
        serverID,
        economyEnabled: false,
        cardTrackingEnabled: true, // Default to true for backward compatibility
        totalTokens: 0,
        mods: [],
        giveaway: []
    });
}

async function addClaim(serverID, userID, claim) {
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

    // Check for existing claims using findOneAndUpdate with upsert
    // This ensures atomicity and prevents race conditions
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
                    $slice: -24 // Keep only the last 24 claims per tier
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
                    $slice: -24 // Keep only the last 24 claims per tier
                }
            },
            $inc: { [`counts.${getTierIndex(claim.tier)}`]: 1 }
        }
    );

    return { 
        claimData, 
        updated: serverUpdate.lastErrorObject?.n > 0 || userUpdate.lastErrorObject?.n > 0 
    };
}

async function addManualClaim(serverID, userID, claim) {
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

    // Use findOneAndUpdate with upsert for atomic operation
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
                    $slice: -48 // Keep only the last 48 claims
                }
            },
            $inc: { [`counts.${getTierIndex(claim.tier)}`]: 1 }
        }
    );

    return { 
        claimData, 
        updated: userUpdate.lastErrorObject?.n > 0 
    };
}

async function getServerData(serverID) {
    return await mServerDB.findOne({ serverID });
}

async function getPlayerData(userID, serverID) {
    return await mUserDB.findOne({ userID, serverID });
}

async function getServerSettings(serverID) {
    return await mServerSettingsDB.findOne({ serverID });
}

function getTierIndex(tier) {
    const tiers = ['CT', 'RT', 'SRT', 'SSRT', 'URT', 'EXT'];
    return tiers.indexOf(tier);
}

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
    // Export database collections
    mServerDB,
    mUserDB,
    mServerSettingsDB,
    mGateDB,
    mGateServerDB,
    mCommandLogsDB
};
