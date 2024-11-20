const connection = require('./modules/connection');
const giveaway = require('./modules/giveaway');
const commandLogs = require('./modules/commandLogs');
const server = require('./modules/server');
const player = require('./modules/player');
const gate = require('./modules/gate');
const wishlist = require('./modules/wishlist');

// Export all functionality
module.exports = {
    // Connection functions
    connectDB: connection.connectDB,
    
    // Giveaway functions
    createGiveaway: giveaway.createGiveaway,
    getGiveaways: giveaway.getGiveaways,
    getGiveaway: giveaway.getGiveaway,
    updateGiveawayTimestamp: giveaway.updateGiveawayTimestamp,
    joinGiveaway: giveaway.joinGiveaway,
    
    // Command logging functions
    logCommand: commandLogs.logCommand,
    getCommandLogs: commandLogs.getCommandLogs,
    
    // Server functions
    createServer: server.createServer,
    createServerSettings: server.createServerSettings,
    toggleRegister: server.toggleRegister,
    toggleAllowRolePing: server.toggleAllowRolePing,
    toggleAllowCooldownPing: server.toggleAllowCooldownPing,
    toggleHandler: server.toggleHandler,
    getServerData: server.getServerData,
    getServerSettings: server.getServerSettings,
    addServerClaim: server.addServerClaim,
    
    // Player functions
    createPlayer: player.createPlayer,
    addClaim: player.addClaim,
    addManualClaim: player.addManualClaim,
    getPlayerData: player.getPlayerData,
    
    // Gate functions
    createGateUser: gate.createGateUser,
    createGateServer: gate.createGateServer,
    updateUserCurrency: gate.updateUserCurrency,
    getGateUser: gate.getGateUser,

    // Wishlist functions
    addToWishlist: wishlist.addToWishlist,
    removeFromWishlist: wishlist.removeFromWishlist,
    isInWishlist: wishlist.isInWishlist,
    getCardWishlistCount: wishlist.getCardWishlistCount,
    getUserWishlistCount: wishlist.getUserWishlistCount,
    getUserWishlist: wishlist.getUserWishlist,
    getCardWishers: wishlist.getCardWishers,
    
    // Database collections (from connection module)
    mServerDB: connection.mServerDB,
    mUserDB: connection.mUserDB,
    mServerSettingsDB: connection.mServerSettingsDB,
    mGateDB: connection.mGateDB,
    mGateServerDB: connection.mGateServerDB,
    mCommandLogsDB: connection.mCommandLogsDB,
    mGiveawayDB: connection.mGiveawayDB,
    mCardWishlistDB: connection.mCardWishlistDB,
    mUserWishlistDB: connection.mUserWishlistDB
};
