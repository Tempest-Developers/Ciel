const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();

const findUserId = require('../utility/findUserId');

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

let serverDB, playerDB, gateServerDB;

async function connectDB() {
  try {
    await client.connect();
    console.log("Connected to MongoDB!");

    serverDB = client.db('ServerDB').collection('servers');
    playerDB = client.db('PlayerDB').collection('players');
    gateServerDB = client.db('GateServerDB').collection('gates');

    // Create indexes for unique fields
    await serverDB.createIndex({ serverID: 1 }, { unique: true });
    await playerDB.createIndex({ userID: 1 }, { unique: true });
    await gateServerDB.createIndex({ userID: 1 }, { unique: true });

    return { serverDB, playerDB, gateServerDB };
  } catch (err) {
    console.error('Error connecting to MongoDB:', err);
    throw err;
  }
}

// Database operations
async function createServer(serverData) {
  return await serverDB.insertOne({
    serverID: serverData.serverID,
    tierCounts: [0, 0, 0, 0, 0, 0], // [CT, RT, SRT, SSRT, UT, EXT]
    claims: []
  });
}

async function createPlayer(playerData) {
  return await playerDB.insertOne({
    userID: playerData.userID,
    tierCounts: [0, 0, 0, 0, 0, 0], // [CT, RT, SRT, SSRT, UT, EXT]
    claims: []
  });
}

async function createGateUser(userData) {
  return await gateServerDB.insertOne({
    userID: userData.userID,
    slimeToken: 0,
    missions: [],
    achievements: [],
    premium: false
  });
}

async function addClaim(serverID, claim) {
  const uniqueID = generateUniqueID();
  const claimData = {
    uniqueID,
    tier: claim.tier,
    claimedID: claim.claimedID,
    cardName: claim.cardName,
    print: claim.print,
    fieldName: claim.fieldName,
    fieldValue: claim.fieldValue,
    timestamp: claim.timestamp,
    serverID
  };

  await serverDB.updateOne(
    { serverID },
    { 
      $push: { claims: claimData },
      $inc: { [`tierCounts.${getTierIndex(claim.tier)}`]: 1 }
    }
  );

  let userId = await findUserId(client, claim.owner.split(" ")[2]);

  await playerDB.updateOne(
    { userID: userId },
    { 
      $push: { claims: claimData },
      $inc: { [`tierCounts.${getTierIndex(claim.tier)}`]: 1 }
    }
  );

  return claimData;
}

async function getServerData(serverID) {
  return await serverDB.findOne({ serverID });
}

// Helper functions
function generateUniqueID() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function getTierIndex(tier) {
  const tiers = ['CT', 'RT', 'SRT', 'SSRT', 'UT', 'EXT'];
  return tiers.indexOf(tier);
}

module.exports = {
  connectDB,
  createServer,
  createPlayer,
  createGateUser,
  addClaim,
  getServerData
};
