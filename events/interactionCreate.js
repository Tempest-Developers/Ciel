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
            try {
                // Get the original command name from the message that created the button
                const commandName = interaction.message?.interaction?.commandName;
                if (commandName === 'gate') {
                    const command = client.slashCommands.get(commandName);
                    if (command?.handleButton) {
                        await command.handleButton(interaction, { database });
                    }
                }
            } catch (error) {
                console.error('Error handling button interaction:', error);
                if (!interaction.replied) {
                    await interaction.reply({
                        content: '❌ An error occurred while processing your interaction.',
                        ephemeral: true
                    });
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
                if (!interaction.replied) {
                    await interaction.reply({
                        content: errorMessage,
                        ephemeral: true
                    });
                }
            } catch (replyError) {
                console.error('Failed to send error message:', replyError);
            }
        }
    },
};
