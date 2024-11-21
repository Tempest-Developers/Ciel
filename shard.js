// shard.js
require('dotenv').config();
const { ShardingManager } = require('discord.js');
const path = require('path');

// Create sharding manager
const manager = new ShardingManager(path.join(__dirname, 'bot.js'), {
    token: process.env.TOKEN,
    totalShards: 'auto',
    respawn: true,
    mode: 'process'
});

// Shard Events
manager.on('shardCreate', shard => {
    console.log(`[Shard Manager] Launching Shard ${shard.id}`);

    // Handle shard specific events
    shard.on('ready', () => {
        console.log(`[Shard ${shard.id}] Ready and serving guilds`);
    });

    shard.on('disconnect', () => {
        console.log(`[Shard ${shard.id}] Disconnected`);
    });

    shard.on('reconnecting', () => {
        console.log(`[Shard ${shard.id}] Reconnecting`);
    });

    shard.on('death', () => {
        console.error(`[Shard ${shard.id}] Died, attempting to respawn...`);
    });

    shard.on('error', error => {
        console.error(`[Shard ${shard.id}] Error:`, error);
    });
});

// Spawn shards
manager.spawn({ timeout: -1 })
    .then(shards => {
        console.log(`[Shard Manager] Successfully spawned ${shards.size} shards`);
    })
    .catch(error => {
        console.error('[Shard Manager] Failed to spawn shards:', error);
    });

// Handle process events
process.on('SIGINT', async () => {
    console.log('[Shard Manager] Received SIGINT. Gracefully shutting down...');
    await manager.respawnAll();
    process.exit(0);
});

process.on('unhandledRejection', error => {
    console.error('[Shard Manager] Unhandled promise rejection:', error);
});
