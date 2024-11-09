const { Events } = require('discord.js');
const handleEditedMazokuMessage = require('../utility/handleEditedMazokuMessage');
const { checkPermissions, checkIfGuildAllowed } = require('../utility/auth');

module.exports = {
	name: Events.MessageUpdate,
	once: false,
	async execute(client, oldMessage, newMessage) {
		if (oldMessage.author.id === client.user.id) return;
        if (newMessage.author.id === client.user.id) return;

        // New permission check
        if (!checkPermissions(newMessage.channel, client.user)) return;
		if (!checkPermissions(oldMessage.channel, client.user)) return;
		if (!checkIfGuildAllowed(client, newMessage.guild.id)) return;
		if (!checkIfGuildAllowed(client, oldMessage.guild.id)) return;

        // Handle Mazoku messages
        handleEditedMazokuMessage(client, oldMessage, newMessage, client.config.mazokuID);
	},
};
