const { Events } = require('discord.js');
const { checkPermissions, checkIfGuildAllowed } = require('../utility/auth');

const GATE_GUILD = '1240866080985976844';

module.exports = {
    name: Events.InteractionCreate,
    once: false,
    async execute(interaction, { database }) {
        const client = interaction.client;
        if (!client) return;

        if (!checkPermissions(interaction.channel, client.user)) return;

        if((await checkIfGuildAllowed(client, interaction.guild?.id)==false) && interaction.commandName!="registerguild") return;

        if (interaction.isButton()) {
            try {
                const commandName = interaction.message?.interaction?.commandName?.split(' ')[0];
                if (commandName === 'gate') {
                    const command = client.slashCommands.get(commandName);
                    if (command?.handleButton) {
                        await command.handleButton(interaction, { database });
                    }
                }
            } catch (error) {
                console.error('Error handling button interaction:', error);
                try {
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({
                            content: '❌ An error occurred while processing your interaction.',
                            ephemeral: true
                        });
                    } else if (interaction.deferred) {
                        await interaction.editReply({
                            content: '❌ An error occurred while processing your interaction.',
                            ephemeral: true
                        });
                    }
                } catch (replyError) {
                    console.error('Failed to send error message for button interaction:', replyError);
                }
            }
            return;
        }

        if (interaction.isAutocomplete()) {
            const command = client.slashCommands.get(interaction.commandName);
            if (!command || !command.autocomplete ) return;

            try {
                await command.autocomplete(interaction);
            } catch (error) {
                console.error('Autocomplete error:', error);
            }
            return;
        }

        if (!interaction.isChatInputCommand()) return;

        const command = client.slashCommands.get(interaction.commandName);
        if (!command) return;

        const { developers } = client.config;
        const config = client.config
        const isDeveloper = developers.includes(interaction.user.id);

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
            const options = {};
            
            interaction.options.data.forEach(option => {
                if (option.type === 1) {
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
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: errorMessage,
                        ephemeral: true
                    });
                } else if (interaction.deferred) {
                    await interaction.editReply({
                        content: errorMessage,
                        ephemeral: true
                    });
                } else if (interaction.replied) {
                    await interaction.followUp({
                        content: errorMessage,
                        ephemeral: true
                    });
                }
            } catch (replyError) {
                console.error('Failed to send error message:', {
                    originalError: error,
                    replyError: replyError,
                    interactionStatus: {
                        replied: interaction.replied,
                        deferred: interaction.deferred
                    }
                });
            }
        }
    },
};
