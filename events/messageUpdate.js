const { Events } = require('discord.js');
const handleEditedMazokuMessage = require('../utility/handleEditedMazokuMessage');
const { checkPermissions, checkIfGuildAllowed } = require('../utility/auth');
const config = require('../config.json');

module.exports = {
	name: Events.MessageUpdate,
	once: false,
	async execute(oldMessage, newMessage, { database }) {
        // Check if messages exist and have necessary properties
        if (!oldMessage?.author || !newMessage?.author) return;
        if (!oldMessage?.guild || !newMessage?.guild) return;

        // Get client from message
        const client = oldMessage.client;
        if (!client) return;

		if (oldMessage.author.id === client.user.id) return;
        if (newMessage.author.id === client.user.id) return;

        // New permission check
        if (!checkPermissions(newMessage.channel, client.user)) return;
		if (!checkPermissions(oldMessage.channel, client.user)) return;

		if (!(await checkIfGuildAllowed(client, newMessage.guild.id)) || !(await checkIfGuildAllowed(client, oldMessage.guild.id))) return;
        // Handle Mazoku messages
        handleEditedMazokuMessage(client, oldMessage, newMessage, config.mazokuID);
	},
};
