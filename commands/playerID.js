const findUserId = require('../utility/findUserId');
const { adminOnly } = require('./tt');

module.exports = {
    name: 'whois',
    description: 'Username to ID',
    developerOnly: true, // Make this command developer-only
    adminOnly: false, // Make this command admin-only
    async execute(message, args) {
        const username = args.slice(0).join(' ');
        const userId = await findUserId(message.client, username);
        await message.reply(`${username} ID: ${userId}`);
    },
};