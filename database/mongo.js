// database/mongo.js

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

const MAX_CLAIMS = 24;

let mServerDB, mUserDB, mServerSettingsDB, mGateDB, gateServerDB;

/**
 * Connects to the MongoDB database.
 * @returns {Promise<Object>} An object containing the database collections.
 */
async function connectDB() {
  try {
    await client.connect();
    console.log("Connected to MongoDB!");

    mServerDB = client.db('MainDB').collection('servers');
    mUserDB = client.db('MainDB').collection('users');
    mServerSettingsDB = client.db('MainDB').collection('serverSettings');
    mGateDB = client.db('MainDB').collection('gates');
    gateServerDB = client.db('MainDB').collection('gateServers');

    await gateServerDB.createIndex({ serverID: 1 }, { unique: true });

    return { mServerDB, mUserDB, mServerSettingsDB, mGateDB, gateServerDB };
  } catch (err) {
    console.error('Error connecting to MongoDB:', err);
    throw err;
  }
}

// Gate Server DB methods

/**
 * Creates a new gate server document.
 * @param {string} serverID The ID of the server.
 * @returns {Promise<Object>} The result of the insert operation.
 */
async function createGateServer(serverID) {
  return await gateServerDB.insertOne({
    serverID: serverID,
    mods: [],
    giveaway: []
  });
}

/**
 * Adds a mod to a gate server.
 * @param {string} serverID The ID of the server.
 * @param {string} userID The ID of the user to add as a mod.
 * @returns {Promise<Object>} The result of the update operation.
 */
async function addGateServerMod(serverID, userID) {
  return await gateServerDB.updateOne(
    { serverID },
    { $addToSet: { mods: userID } }
  );
}

/**
 * Removes a mod from a gate server.
 * @param {string} serverID The ID of the server.
 * @param {string} userID The ID of the user to remove as a mod.
 * @returns {Promise<Object>} The result of the update operation.
 */
async function removeGateServerMod(serverID, userID) {
  return await gateServerDB.updateOne(
    { serverID },
    { $pull: { mods: userID } }
  );
}

/**
 * Adds a giveaway to a gate server.
 * @param {string} serverID The ID of the server.
 * @param {Object} giveawayItem The giveaway item to add.
 * @returns {Promise<Object>} The result of the update operation.
 */
async function addGiveaway(serverID, giveawayItem) {
  const giveawayData = {
    id: Date.now().toString(),
    type: giveawayItem.type,
    itemId: giveawayItem.id,
    amount: giveawayItem.amount,
    print: giveawayItem.print,
    requirement: {
      tier: giveawayItem.requirement.tier,
      claims: giveawayItem.requirement.claims
    },
    timestamp: new Date()
  };

  return await gateServerDB.updateOne(
    { serverID },
    { $push: { giveaway: giveawayData } }
  );
}

/**
 * Removes a giveaway from a gate server.
 * @param {string} serverID The ID of the server.
 * @param {string} giveawayId The ID of the giveaway to remove.
 * @returns {Promise<Object>} The result of the update operation.
 */
async function removeGiveaway(serverID, giveawayId) {
  return await gateServerDB.updateOne(
    { serverID },
    { $pull: { giveaway: { id: giveawayId } } }
  );
}

/**
 * Retrieves the data for a gate server.
 * @param {string} serverID The ID of the server.
 * @returns {Promise<Object>} The gate server data.
 */
async function getGateServerData(serverID) {
  return await gateServerDB.findOne({ serverID });
}

/**
 * Retrieves the mods for a gate server.
 * @param {string} serverID The ID of the server.
 * @returns {Promise<Array<string>>} The IDs of the mods.
 */
async function getGateServerMods(serverID) {
  const server = await gateServerDB.findOne({ serverID });
  return server ? server.mods : [];
}

/**
 * Checks if a user is a mod for a gate server.
 * @param {string} serverID The ID of the server.
 * @param {string} userID The ID of the user to check.
 * @returns {Promise<boolean>} True if the user is a mod, false otherwise.
 */
async function isGateServerMod(serverID, userID) {
  const server = await gateServerDB.findOne({ serverID, mods: userID });
  return !!server;
}

/**
 * Retrieves the active giveaways for a gate server.
 * @param {string} serverID The ID of the server.
 * @returns {Promise<Array<Object>>} The active giveaways.
 */
async function getActiveGiveaways(serverID) {
  const server = await gateServerDB.findOne({ serverID });
  return server ? server.giveaway : [];
}

/**
 * Updates the requirement for a giveaway.
 * @param {string} serverID The ID of the server.
 * @param {string} giveawayId The ID of the giveaway to update.
 * @param {Object} newRequirement The new requirement.
 * @returns {Promise<Object>} The result of the update operation.
 */
async function updateGiveawayRequirement(serverID, giveawayId, newRequirement) {
  return await gateServerDB.updateOne(
    { serverID, 'giveaway.id': giveawayId },
    { $set: { 'giveaway.$.requirement': newRequirement } }
  );
}

// Additional utility methods for giveaway management

/**
 * Retrieves a giveaway by ID.
 * @param {string} serverID The ID of the server.
 * @param {string} giveawayId The ID of the giveaway to retrieve.
 * @returns {Promise<Object>} The giveaway data.
 */
async function getGiveawayById(serverID, giveawayId) {
  const server = await gateServerDB.findOne({ serverID });
  return server?.giveaway.find(g => g.id === giveawayId);
}

/**
 * Updates the amount of a giveaway.
 * @param {string} serverID The ID of the server.
 * @param {string} giveawayId The ID of the giveaway to update.
 * @param {number} newAmount The new amount.
 * @returns {Promise<Object>} The result of the update operation.
 */
async function updateGiveawayAmount(serverID, giveawayId, newAmount) {
  return await gateServerDB.updateOne(
    { serverID, 'giveaway.id': giveawayId },
    { $set: { 'giveaway.$.amount': newAmount } }
  );
}

/**
 * Clears expired giveaways for a server.
 * @param {string} serverID The ID of the server.
 * @param {number} expiryHours The number of hours after which a giveaway is considered expired.
 * @returns {Promise<Object>} The result of the update operation.
 */
async function clearExpiredGiveaways(serverID, expiryHours = 24) {
  const expiryDate = new Date(Date.now() - (expiryHours * 60 * 60 * 1000));

  return await gateServerDB.updateOne(
    { serverID },
    { $pull: { giveaway: { timestamp: { $lt: expiryDate } } } }
  );
}

/**
 * Adds multiple giveaways to a server.
 * @param {string} serverID The ID of the server.
 * @param {Array<Object>} giveawayItems The giveaways to add.
 * @returns {Promise<Object>} The result of the update operation.
 */
async function bulkAddGiveaways(serverID, giveawayItems) {
  const giveawayData = giveawayItems.map(item => ({
    id: Date.now().toString() + Math.random().toString(36).substr(2),
    type: item.type,
    itemId: item.id,
    amount: item.amount,
    print: item.print,
    requirement: {
      tier: item.requirement.tier,
      claims: item.requirement.claims
    },
    timestamp: new Date()
  }));

  return await gateServerDB.updateOne(
    { serverID },
    { $push: { giveaway: { $each: giveawayData } } }
  );
}

/**
 * Retrieves giveaways by type.
 * @param {string} serverID The ID of the server.
 * @param {string} type The type of giveaways to retrieve.
 * @returns {Promise<Array<Object>>} The giveaways of the specified type.
 */
async function getGiveawaysByType(serverID, type) {
  const server = await gateServerDB.findOne({ serverID });
  return server?.giveaway.filter(g => g.type === type) || [];
}

/**
 * Retrieves giveaways by requirement tier.
 * @param {string} serverID The ID of the server.
 * @param {string} tier The requirement tier of the giveaways to retrieve.
 * @returns {Promise<Array<Object>>} The giveaways with the specified requirement tier.
 */
async function getGiveawaysByRequirement(serverID, tier) {
  const server = await gateServerDB.findOne({ serverID });
  return server?.giveaway.filter(g => g.requirement.tier === tier) || [];
}

module.exports = {
  connectDB,
  createGateServer,
  addGateServerMod,
  removeGateServerMod,
  addGiveaway,
  removeGiveaway,
  getGateServerData,
  getGateServerMods,
  isGateServerMod,
  getActiveGiveaways,
  updateGiveawayRequirement,
  getGiveawayById,
  updateGiveawayAmount,
  clearExpiredGiveaways,
  bulkAddGiveaways,
  getGiveawaysByType,
  getGiveawaysByRequirement
};
