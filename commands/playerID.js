const findUserId = require('../utility/findUserId');

module.exports = {
    name: 'whois',
    description: 'Username to ID',
    developerOnly: true, // Make this command developer-only
    async execute(message, args) {
        const username = args.slice(0).join(' ');
        const userId = await findUserId(message.client, username);
        await message.reply(`${username} ID: ${userId}`);
    },
};