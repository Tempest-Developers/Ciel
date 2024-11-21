// bot.js
require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');

const BOT_TOKEN = process.env.TOKEN;

// Import database modules
const db = require('./database/mongo');
const serverModule = require('./database/modules/server');
const playerModule = require('./database/modules/player');
const gateModule = require('./database/modules/gate');
const giveawayModule = require('./database/modules/giveaway');
const commandLogsModule = require('./database/modules/commandLogs');
const wishlistModule = require('./database/modules/wishlist');

const client = new Client({
    shards: 'auto', // Enable sharding mode
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

client.commands = new Collection();
client.slashCommands = new Collection();
client.config = require('./config.json');

// Initialize database connection with retry logic and shard awareness
async function initializeDatabase(retries = 5, delay = 5000) {
    const shardId = client.shard?.ids[0] ?? 'Unsharded';
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const { 
                mServerDB, 
                mUserDB, 
                mServerSettingsDB, 
                mGateDB, 
                mGateServerDB,
                mCommandLogsDB,
                mGiveawayDB,
                mCardWishlistDB,
                mUserWishlistDB
            } = await db.connectDB();

            // Make database collections and methods accessible throughout the bot
            client.database = {
                // Spread database methods first
                ...db,
                
                // Include specific database module methods
                createServer: serverModule.createServer,
                createServerSettings: serverModule.createServerSettings,
                toggleRegister: serverModule.toggleRegister,
                toggleAllowRolePing: serverModule.toggleAllowRolePing,
                getServerData: serverModule.getServerData,
                getServerSettings: serverModule.getServerSettings,
                addServerClaim: serverModule.addServerClaim,

                // Player module methods
                createPlayer: playerModule.createPlayer,
                getPlayer: playerModule.getPlayer,
                updatePlayer: playerModule.updatePlayer,

                // Gate module methods
                ...gateModule,

                // Giveaway module methods
                ...giveawayModule,

                // Command logs module methods
                logCommand: commandLogsModule.logCommand,

                // Wishlist module methods
                ...wishlistModule,

                // Set specific collections so they don't get overwritten
                servers: mServerDB,
                users: mUserDB,
                serverSettings: mServerSettingsDB,
                mGateDB,
                mGateServerDB,
                mCommandLogsDB,
                mGiveawayDB,
                mCardWishlistDB,
                mUserWishlistDB
            };
            
            console.log(`[Shard ${shardId}] Database initialization successful`);
            return true;
        } catch (err) {
            console.error(`[Shard ${shardId}] Database initialization attempt ${attempt} failed:`, err);
            if (attempt === retries) {
                console.error(`[Shard ${shardId}] All database connection attempts failed`);
                return false;
            }
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

// Load Command Handlers
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    client.commands.set(command.name, command);
}

// Load Slash Commands
const slashCommandsPath = path.join(__dirname, 'slashCommands');
const slashCommandFiles = fs.readdirSync(slashCommandsPath).filter(file => file.endsWith('.js'));

for (const file of slashCommandFiles) {
    const command = require(path.join(slashCommandsPath, file));
    client.slashCommands.set(command.data.name, command);
}

// Event Handler with improved error handling and shard awareness
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
    const event = require(path.join(eventsPath, file));
    if (event.once) {
        client.once(event.name, async (...args) => {
            try {
                if (!args[0].guild) return;
                const serverExist = await client.database.getServerSettings(args[0].guild.id);
                if(!serverExist) await client.database.createServerSettings(args[0].guild.id);
                await event.execute(...args, { 
                    database: client.database, 
                    config: client.config,
                    shardId: client.shard?.ids[0] 
                });
            } catch (error) {
                console.error(`[Shard ${client.shard?.ids[0]}] Error in event ${event.name}:`, error);
            }
        });
    } else {
        client.on(event.name, async (...args) => {
            try {
                if (event.name === 'messageCreate') {
                    await event.execute(...args, { 
                        database: client.database, 
                        config: client.config,
                        shardId: client.shard?.ids[0]
                    });
                } else {
                    if (!args[0].guild) return;
                    const serverExist = await client.database.getServerSettings(args[0].guild.id);
                    if(!serverExist) await client.database.createServerSettings(args[0].guild.id);
                    await event.execute(...args, { 
                        database: client.database, 
                        config: client.config,
                        shardId: client.shard?.ids[0]
                    });
                }
            } catch (error) {
                console.error(`[Shard ${client.shard?.ids[0]}] Error in event ${event.name}:`, error);
            }
        });
    }
}

// Discord client error handling with shard awareness
client.on('error', error => {
    console.error(`[Shard ${client.shard?.ids[0]}] Discord client error:`, error);
});

client.on('disconnect', () => {
    console.log(`[Shard ${client.shard?.ids[0]}] Bot disconnected from Discord`);
});

client.on('reconnecting', () => {
    console.log(`[Shard ${client.shard?.ids[0]}] Bot reconnecting to Discord`);
});

client.on('warn', info => {
    console.log(`[Shard ${client.shard?.ids[0]}] Warning:`, info);
});

// Initialize database and start bot
async function startBot() {
    try {
        const dbInitialized = await initializeDatabase();
        if (!dbInitialized) {
            console.error(`[Shard ${client.shard?.ids[0]}] Failed to initialize database. Exiting...`);
            process.exit(1);
        }

        await client.login(BOT_TOKEN);
        console.log(`[Shard ${client.shard?.ids[0]}] Bot successfully logged in to Discord`);
    } catch (error) {
        console.error(`[Shard ${client.shard?.ids[0]}] Error starting bot:`, error);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log(`[Shard ${client.shard?.ids[0]}] Received SIGINT. Cleaning up...`);
    try {
        await client.destroy();
        process.exit(0);
    } catch (error) {
        console.error(`[Shard ${client.shard?.ids[0]}] Error during cleanup:`, error);
        process.exit(1);
    }
});

process.on('unhandledRejection', error => {
    console.error(`[Shard ${client.shard?.ids[0]}] Unhandled promise rejection:`, error);
});

startBot();
