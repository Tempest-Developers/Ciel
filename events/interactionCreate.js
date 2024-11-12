const { Events } = require('discord.js');
const { checkPermissions, checkIfGuildAllowed } = require('../utility/auth');

const GATE_GUILD = '1240866080985976844';

module.exports = {
    name: Events.InteractionCreate,
    once: false,
    async execute(interaction, { database }) {
        // Get client from interaction
        const client = interaction.client;
        if (!client) return;

        // New permission check
        if (!checkPermissions(interaction.channel, client.user)) return;

        if((await checkIfGuildAllowed(client, interaction.guild?.id)==false) && interaction.commandName!="registerguild") return;

        // Handle button interactions
        if (interaction.isButton()) {
            // Handle button interactions here
            const buttonHandler = client.buttons?.get(interaction.customId);
            if (buttonHandler) {
                try {
                    await buttonHandler.execute(interaction);
                } catch (error) {
                    console.error(`Error executing button ${interaction.customId}:`, error);
                }
            }
            return;
        }

        // Handle autocomplete interactions
        if (interaction.isAutocomplete()) {
            const command = client.slashCommands.get(interaction.commandName);
            if (!command || !command.autocomplete ) return;

            try {
                await command.autocomplete(interaction);
            } catch (error) {
                console.error(error);
            }
            return;
        }

        if (!interaction.isChatInputCommand()) return;

        const command = client.slashCommands.get(interaction.commandName);
        if (!command) return;

        const { developers } = client.config;
        const config = client.config
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

        try {
            // Log the command usage
            const options = {};
            
            // Collect all command options
            interaction.options.data.forEach(option => {
                if (option.type === 1) { // Subcommand
                    options.subcommand = option.name;
                    if (option.options) {
                        option.options.forEach(subOption => {
                            options[subOption.name] = subOption.value;
                        });
                    }
                } else {
                    options[option.name] = option.value;
                }
            });

            await database.logCommand(
                interaction.user.id,
                interaction.user.tag,
                interaction.guild.id,
                interaction.guild.name,
                interaction.commandName,
                options
            );

            await command.execute(interaction, { database, config });
        } catch (error) {
            console.error('Command execution error:', error);
            
            const errorMessage = 'There was an error while executing this command!';
            
            try {
                // Check the interaction state and respond appropriately
                if (interaction.deferred) {
                    // If the interaction was deferred, edit the deferred reply
                    await interaction.editReply({
                        content: errorMessage,
                        ephemeral: true
                    });
                } else if (!interaction.replied) {
                    // If the interaction hasn't been replied to at all, send a new reply
                    await interaction.reply({
                        content: errorMessage,
                        ephemeral: true
                    });
                }
                // If the interaction was already replied to, we don't need to do anything
            } catch (replyError) {
                // If we fail to send the error message, log it but don't throw
                console.error('Failed to send error message:', replyError);
            }
        }
    },
};
