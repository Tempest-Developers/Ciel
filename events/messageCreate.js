module.exports = {
    name: 'messageCreate',
    async execute(message) {
        if (message.author.bot) return;
        
        const { prefix, developers } = message.client.config;
        
        if (!message.content.startsWith(prefix)) return;
        
        const args = message.content.slice(prefix.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();
        
        const command = message.client.commands.get(commandName);
        
        if (!command) return;
        
        // Developer check
        if (command.developerOnly && !developers.includes(message.author.id)) {
            return //message.reply('This command is only available to bot developers.');
        }
        
        try {
            await command.execute(message, args);
        } catch (error) {
            console.error(error);
            message.reply('There was an error executing that command.');
        }
    },
};