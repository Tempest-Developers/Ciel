const handleCreateMazokuMessage = require('../utility/handleCreateMazokuMessage');

module.exports = {
    name: 'messageCreate',
    async execute(client, message) {
        if (message.author.id === client.user.id) return;

        // Handle Mazoku messages
        handleCreateMazokuMessage(message, client.config.mazokuID);

        if (message.author.bot) return;
        const { prefix, developers, admins } = message.client.config;
        
        if (!message.content.startsWith(prefix)) return;

        const args = message.content.slice(prefix.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();
        
        const command = message.client.commands.get(commandName);
        
        if (!command) return;
  
        if ((command.adminOnly || command.developerOnly) && 
            !admins.includes(message.author.id) && 
            !developers.includes(message.author.id)) {
            return;
        }

        try {
            await command.execute(message, args);
        } catch (error) {
            console.error(error);
            message.reply('There was an error executing that command.');
        }
    },
};