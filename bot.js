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

// Initialize database connection
async function initializeDatabase() {
    try {
        const { 
            mServerDB, 
            mUserDB, 
            mServerSettingsDB, 
            mGateDB, 
            gateServerDB 
        } = await db.connectDB();

        // Make database collections accessible throughout the bot
        client.database = {
            servers: mServerDB,
            users: mUserDB,
            serverSettings: mServerSettingsDB,
            gates: mGateDB,
            gateServers: gateServerDB,
            ...db  // Spread the rest of the database methods
        };
    } catch (err) {
        console.error('Failed to connect to database:', err);
        process.exit(1); // Exit if database connection fails
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

// Event Handler
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
    const event = require(path.join(eventsPath, file));
    if (event.once) {
        
        client.once(event.name, async (...args) => {

            const serverExist = await client.database.getServerSettings(args[0].guild.id)
            if(!serverExist) client.database.createServerSettings(args[0].guild.id).then(console.log("Created server settings 1"))
            if (!args[0].guild) return;
            event.execute(client,...args);
        });
    } else {
        client.on(event.name, async (...args) => {

            const serverExist = await client.database.getServerSettings(args[0].guild.id)
            if(!serverExist) client.database.createServerSettings(args[0].guild.id).then(console.log("Created server settings 2"))
            if (!args[0].guild) return;
            event.execute(client,...args);
        });
    }
}

// Initialize database before logging in
initializeDatabase().then(() => {
    // Use TOKEN_TEST for development
    client.login(BOT_TOKEN);
}).catch(err => {
    console.error('Failed to initialize bot:', err);
    process.exit(1);
});
