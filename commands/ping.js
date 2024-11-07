const { adminOnly } = require("./tt");

module.exports = {
    name: 'ping',
    description: 'Ping command',
    developerOnly: true, // Make this command developer-only
    adminOnly: false, // Make this command admin-only
    async execute(message, args) {
        const reply = await message.reply('Pinging...');
        const pingTime = reply.createdTimestamp - message.createdTimestamp;
        
        reply.edit(`Pong! Bot Latency: ${pingTime}ms, API Latency: ${message.client.ws.ping}ms`);
    },
};