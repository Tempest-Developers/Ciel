const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'log',
    description: 'View command usage logs',
    devOnly: true,
    adminOnly: true,
    async execute(message, args) {
        const { getCommandLogs } = message.client.database;
        
        try {
            let page = 1;
            let serverID = null;

            // Parse arguments
            if (args.length > 0) {
                // First argument is always page number
                page = parseInt(args[0]);
                if (isNaN(page) || page < 1) page = 1;

                // Second argument is optional server ID
                if (args.length > 1) {
                    serverID = args[1];
                }
            }

            const result = await getCommandLogs(serverID, page);
            
            if (!result.logs.length) {
                return message.reply('No command logs found.');
            }

            const embed = new EmbedBuilder()
                .setTitle('Command Logs')
                .setColor('#0099ff')
                .setFooter({ text: `Page ${page}/${result.totalPages} • Total Logs: ${result.totalLogs}` });

            const logEntries = result.logs.map(log => {
                const timestamp = new Date(log.timestamp).toLocaleString();
                let commandInfo = `/${log.commandName}`;
                
                if (log.options.subcommand) {
                    commandInfo += ` ${log.options.subcommand}`;
                }

                const optionsStr = Object.entries(log.options)
                    .filter(([key]) => key !== 'subcommand')
                    .map(([key, value]) => `${key}: ${value}`)
                    .join(', ');

                if (optionsStr) {
                    commandInfo += ` [${optionsStr}]`;
                }

                return `\`${timestamp}\`
User: ${log.username} (${log.userID})
Server: ${log.serverName} (${log.serverID})
Command: ${commandInfo}
${'─'.repeat(40)}`;
            }).join('\n');

            embed.setDescription(logEntries);

            if (serverID) {
                embed.setTitle(`Command Logs for Server ${serverID}`);
            }

            return message.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in xlog command:', error);
            return message.reply('An error occurred while fetching command logs.');
        }
    }
};
