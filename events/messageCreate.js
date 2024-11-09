const handleCreateMazokuMessage = require('../utility/handleCreateMazokuMessage');
const { checkPermissions, checkIfGuildAllowed } = require('../utility/auth');
const config = require('../config.json');

module.exports = {
    name: 'messageCreate',
    async execute(client, message) {
        if (message.author.id === client.user.id) return;

        // New permission check
        if (!checkPermissions(message.channel, message.client.user)) return;
        if (await checkIfGuildAllowed(client, message.guild.id) == false) return;
        
        // Handle Mazoku messages
        handleCreateMazokuMessage(message, client.config.mazokuID);

        if (message.author.bot) return;
        const { prefix, developers, admins } = message.client.config;
        
        if (!message.content.startsWith(prefix)) return;

        const args = message.content.slice(prefix.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();
        
        const command = message.client.commands.get(commandName);
        
        if (!command) return;
  
		if (!(await checkIfGuildAllowed(client, newMessage.guild.id)) || !(await checkIfGuildAllowed(client, oldMessage.guild.id))) return;

        try {
            await command.execute(message, args);
        } catch (error) {
            console.error(error);
            message.reply('There was an error executing that command.');
        }
    },
};
