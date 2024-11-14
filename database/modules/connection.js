const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
    connectTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    maxPoolSize: 50,
    minPoolSize: 5
});

let mServerDB, mUserDB, mServerSettingsDB, mGateDB, mGateServerDB, mCommandLogsDB, mGiveawayDB;
let mCardWishlistDB, mUserWishlistDB;
let isConnected = false;

async function connectDB() {
    if (isConnected) {
        return { 
            mServerDB, mUserDB, mServerSettingsDB, mGateDB, mGateServerDB, 
            mCommandLogsDB, mGiveawayDB, mCardWishlistDB, mUserWishlistDB 
        };
    }

    try {
        client.on('serverDescriptionChanged', () => {
            console.log('MongoDB server description changed');
        });

        client.on('serverHeartbeatFailed', () => {
            console.log('MongoDB server heartbeat failed');
            isConnected = false;
            setTimeout(reconnect, 5000);
        });

        client.on('serverHeartbeatSucceeded', () => {
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
        mCardWishlistDB = client.db('MainDB').collection('mCardWishlistDB');
        mUserWishlistDB = client.db('MainDB').collection('mUserWishlistDB');

        await initializeIndexes();

        return { 
            mServerDB, mUserDB, mServerSettingsDB, mGateDB, mGateServerDB, 
            mCommandLogsDB, mGiveawayDB, mCardWishlistDB, mUserWishlistDB 
        };
    } catch (err) {
        console.error('Error connecting to MongoDB:', err);
        isConnected = false;
        setTimeout(reconnect, 5000);
        throw err;
    }
}

async function initializeIndexes() {
    // Create indexes for unique fields
    await mServerDB.createIndex({ serverID: 1 }, { unique: true });
    await mUserDB.createIndex({ userID: 1, serverID: 1 }, { unique: true });
    await mServerSettingsDB.createIndex({ serverID: 1 }, { unique: true });
    await mGateDB.createIndex({ userID: 1 }, { unique: true });
    await mGateServerDB.createIndex({ serverID: 1 }, { unique: true });
    await mGiveawayDB.createIndex({ giveawayID: 1 }, { unique: true });

    // Create indexes for wishlist collections
    await mCardWishlistDB.createIndex({ cardId: 1 }, { unique: true });
    await mUserWishlistDB.createIndex({ userId: 1 }, { unique: true });
    await mCardWishlistDB.createIndex({ count: 1 });
    await mUserWishlistDB.createIndex({ count: 1 });
    await mCardWishlistDB.createIndex({ 'userWishes': 1 });
    await mUserWishlistDB.createIndex({ 'cardIds': 1 });

    // Create index for command logs
    await mCommandLogsDB.createIndex({ serverID: 1 });
    await mCommandLogsDB.createIndex({ timestamp: 1 });

    // Create index for giveaway timestamps
    await mGiveawayDB.createIndex({ endTimestamp: 1 });
    await mGiveawayDB.createIndex({ active: 1 });

    // Create compound indexes for claims
    const tiers = ['CT', 'RT', 'SRT', 'SSRT', 'URT', 'EXT'];
    for (const tier of tiers) {
        await mServerDB.createIndex({
            [`claims.${tier}.claimedID`]: 1,
            [`claims.${tier}.cardID`]: 1,
            [`claims.${tier}.timestamp`]: 1
        });
        
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
    wrapDbOperation,
    client,
    mServerDB,
    mUserDB,
    mServerSettingsDB,
    mGateDB,
    mGateServerDB,
    mCommandLogsDB,
    mGiveawayDB,
    mCardWishlistDB,
    mUserWishlistDB
};
