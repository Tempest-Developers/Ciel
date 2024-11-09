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

let mServerDB, mUserDB, mServerSettingsDB, mGateDB, mGateServerDB;

async function connectDB() {
    try {
        await client.connect();
        console.log("Connected to MongoDB!");

        mServerDB = client.db('MainDB').collection('mServerDB');
        mUserDB = client.db('MainDB').collection('mUserDB');
        mServerSettingsDB = client.db('MainDB').collection('mServerSettingsDB');
        mGateDB = client.db('MainDB').collection('mGateDB');
        mGateServerDB = client.db('MainDB').collection('mGateServerDB');

        // Create indexes for unique fields
        await mServerDB.createIndex({ serverID: 1 }, { unique: true });
        await mUserDB.createIndex({ userID: 1, serverID: 1 }, { unique: true });
        await mServerSettingsDB.createIndex({ serverID: 1 }, { unique: true });
        await mGateDB.createIndex({ userID: 1 }, { unique: true });
        await mGateServerDB.createIndex({ serverID: 1 }, { unique: true });

        return { mServerDB, mUserDB, mServerSettingsDB, mGateDB, mGateServerDB };
    } catch (err) {
        console.error('Error connecting to MongoDB:', err);
        throw err;
    }
}

async function createServer(serverID) {
    return await mServerDB.insertOne({
        serverID,
        counts: [0, 0, 0, 0, 0, 0],
        claims: [],
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

      const newRegisterValue = true//!serverSettings.register;

      await mServerSettingsDB.updateOne(
          { serverID },
          { $set: { register: newRegisterValue } }
      );

      return { serverID, register: newRegisterValue };
  } catch (error) {
      console.error('Error toggling register:', error);
      throw error; // Re-throw the error if you want the caller to handle it
  }
}


async function createPlayer(userID, serverID) {
    return await mUserDB.insertOne({
        userID,
        serverID,
        counts: [0, 0, 0, 0, 0, 0],
        claims: []
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
        mods: [],
        giveaway: []
    });
}

async function addClaim(serverID, userID, claim) {
    const claimData = {
        claimedID: claim.claimedID,
        userID,
        serverID,
        cardID: claim.cardID,
        owner: claim.owner,
        artist: claim.artist,
        print: claim.print,
        tier: claim.tier
    };

    // Update server claims with 24 limit
    await mServerDB.updateOne(
        { serverID },
        {
            $push: {
                claims: {
                    $each: [claimData],
                    $slice: -24 // Keep only the last 24 claims
                }
            },
            $inc: { [`counts.${getTierIndex(claim.tier)}`]: 1 }
        }
    );

    // Update user claims with 24 limit
    await mUserDB.updateOne(
        { userID, serverID },
        {
            $push: {
                claims: {
                    $each: [claimData],
                    $slice: -24 // Keep only the last 24 claims
                }
            },
            $inc: { [`counts.${getTierIndex(claim.tier)}`]: 1 }
        }
    );

    return claimData;
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
    getServerData,
    getPlayerData,
    getServerSettings,
    toggleRegister
};
