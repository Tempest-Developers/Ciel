const { Events } = require('discord.js');

module.exports = {
	name: Events.MessageUpdate,
	once: false,
	execute(oldMessage, newMessage) {
        if (oldMessage.author.bot) return;
		// Your code here
		console.log(`Message updated from ${oldMessage.content} to ${newMessage.content}`);
	},
};
