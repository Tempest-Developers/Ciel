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
        // First check if the giveaway exists and is active
        const giveaway = await mGiveawayDB.findOne({ 
            giveawayID,
            active: true
        });

        if (!giveaway) {
            throw new Error('Giveaway not found or not active');
        }

        // Check if user has already joined
        if (giveaway.users?.some(user => user.userID === userID)) {
            throw new Error('User has already joined this giveaway');
        }

        // Add user to giveaway
        const result = await mGiveawayDB.updateOne(
            { 
                giveawayID,
                active: true,
                'users.userID': { $ne: userID } // Extra check to prevent duplicate entries
            },
            { 
                $push: { 
                    users: { userID, amount_tickets: ticketAmount },
                    logs: { userID, timestamp: new Date() }
                }
            }
        );

        if (result.matchedCount === 0) {
            throw new Error('Failed to join giveaway');
        }

        return result;
    });
}

// Rest of the file remains unchanged...

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
