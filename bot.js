// bot.js
require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { checkPermissions, checkIfGuildAllowed } = require('./utility/auth')

const BOT_TOKEN = process.env.TOKEN;

// Import database module
const db = require('./database/mongo');

const client = new Client({
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

// Initialize database connection with retry logic
async function initializeDatabase(retries = 5, delay = 5000) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const { 
                mServerDB, 
                mUserDB, 
                mServerSettingsDB, 
                mGateDB, 
                mGateServerDB 
            } = await db.connectDB();

            // Make database collections and methods accessible throughout the bot
            client.database = {
                // Spread database methods first
                ...db,
                // Then set specific collections so they don't get overwritten
                servers: mServerDB,
                users: mUserDB,
                serverSettings: mServerSettingsDB,
                mGateDB,
                mGateServerDB
            };
            
            console.log('Database initialization successful');
            return true;
        } catch (err) {
            console.error(`Database initialization attempt ${attempt} failed:`, err);
            if (attempt === retries) {
                console.error('All database connection attempts failed');
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

// Event Handler with improved error handling
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
                await event.execute(client, ...args);
            } catch (error) {
                console.error(`Error in event ${event.name}:`, error);
            }
        });
    } else {
        client.on(event.name, async (...args) => {
            try {
                if (!args[0].guild) return;
                const serverExist = await client.database.getServerSettings(args[0].guild.id);
                if(!serverExist) await client.database.createServerSettings(args[0].guild.id);
                await event.execute(client, ...args);
            } catch (error) {
                console.error(`Error in event ${event.name}:`, error);
            }
        });
    }
}

// Discord client error handling
client.on('error', error => {
    console.error('Discord client error:', error);
});

client.on('disconnect', () => {
    console.log('Bot disconnected from Discord');
});

client.on('reconnecting', () => {
    console.log('Bot reconnecting to Discord');
});

client.on('warn', info => {
    console.log('Warning:', info);
});

// Initialize database and start bot
async function startBot() {
    try {
        const dbInitialized = await initializeDatabase();
        if (!dbInitialized) {
            console.error('Failed to initialize database. Exiting...');
            process.exit(1);
        }

        await client.login(BOT_TOKEN);
        console.log('Bot successfully logged in to Discord');
    } catch (error) {
        console.error('Error starting bot:', error);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Received SIGINT. Cleaning up...');
    try {
        await client.destroy();
        process.exit(0);
    } catch (error) {
        console.error('Error during cleanup:', error);
        process.exit(1);
    }
});

process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

startBot();
