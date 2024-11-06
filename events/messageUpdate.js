const { Events } = require('discord.js');
const handleEditedMazokuMessage = require('../utility/handleEditedMazokuMessage');

module.exports = {
	name: Events.MessageUpdate,
	once: false,
	execute(client, oldMessage, newMessage) {
		if (oldMessage.author.id === client.user.id) return;
        if (newMessage.author.id === client.user.id) return;

        // Handle Mazoku messages
        handleEditedMazokuMessage(client, oldMessage, newMessage, client.config.mazokuID);
	},
};
