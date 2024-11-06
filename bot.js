// bot.js
require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

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

// Connect to MongoDB
const uri = process.env.MONGODB_URI;
const clientMongo = new MongoClient(uri);

async function connectToMongoDB() {
    try {
        await clientMongo.connect();
        console.log('Connected to MongoDB');
    } catch (err) {
        console.error('MongoDB connection error:', err);
    }
}

connectToMongoDB();

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
    try {
        const command = require(path.join(slashCommandsPath, file));

        if (!command.data || !command.data.name) {
            console.error(`Invalid command file: ${file}. Command data or name is missing.`);
            continue;
        }

        if (client.slashCommands.has(command.data.name)) {
            console.error(`Duplicate command name: ${command.data.name}. Skipping...`);
            continue;
        }

        client.slashCommands.set(command.data.name, command);
        console.log(`Loaded slash command: ${command.data.name}`);
    } catch (error) {
        console.error(`Error loading command file: ${file}. ${error.message}`);
    }
}


// Event Handler
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
    const event = require(path.join(eventsPath, file));
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args));
    } else {
        client.on(event.name, (...args) => event.execute(...args));
    }
}

client.login(process.env.TOKEN_TEST);