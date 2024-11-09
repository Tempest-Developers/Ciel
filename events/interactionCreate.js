const { Events } = require('discord.js');
const { checkPermissions, checkIfGuildAllowed } = require('../utility/auth');

module.exports = {
    name: Events.InteractionCreate,
    once: false,
    async execute(client, interaction) {

        console.log("InteractionCreate")

        // New permission check
        if (!checkPermissions(interaction.channel, interaction.client.user)) return;

        console.log("InteractionCreate | Permission Checked")

        if((await checkIfGuildAllowed(client, interaction.guild.id)==false) && interaction.commandName!="registerguild") return;
        console.log(await checkIfGuildAllowed(client, interaction.guild.id)==false)
        console.log(interaction.commandName!="registerguild")

        // Handle autocomplete interactions
        if (interaction.isAutocomplete()) {
            const command = interaction.client.slashCommands.get(interaction.commandName);
            console.log("= = = = = = = = = = = = = = = = =")
            console.log("InteractionCreate | Guild Check Passed | Autocomplete")
            if (!command || !command.autocomplete ) return;

            try {
                await command.autocomplete(interaction);
            } catch (error) {
                console.error(error);
            }
            return;
        }

        if (!interaction.isChatInputCommand()) return;
        console.log("InteractionCreate | Chat Input Command")

        const command = interaction.client.slashCommands.get(interaction.commandName);
        if (!command) return;
        console.log("InteractionCreate | Command Checked")

        const { developers } = interaction.client.config;
        const isDeveloper = developers.includes(interaction.user.id);

        // Check permissions
        if (command.developerOnly && !isDeveloper) {
            try {
                return await interaction.reply({ 
                    content: 'This command is only available to developers.', 
                    ephemeral: true 
                });
            } catch (error) {
                console.error('Failed to reply to permission check:', error);
                return;
            }
        }

        console.log("InteractionCreate | Config Permissions Checked")

        try {
            console.log("InteractionCreate | Executing Command")
            await command.execute(interaction, { database: interaction.client.database });
        } catch (error) {
            console.error('Command execution error:', error);
            
            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ 
                        content: 'There was an error while executing this command!', 
                        ephemeral: true 
                    });
                } else if (interaction.deferred) {
                    await interaction.editReply({
                        content: 'There was an error while executing this command!',
                    });
                }
            } catch (replyError) {
                console.error('Failed to send error message:', replyError);
            }
        }
    },
};
