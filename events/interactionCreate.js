const { Events } = require('discord.js');
const { checkPermissions, checkIfGuildAllowed } = require('../utility/auth');
const { handleInteraction, handleCommandError, safeDefer } = require('../utility/interactionHandler');

const GATE_GUILD = '1240866080985976844';

module.exports = {
    name: Events.InteractionCreate,
    once: false,
    async execute(interaction, { database }) {
        const client = interaction.client;
        if (!client) return;

        if (!checkPermissions(interaction.channel, client.user)) return;

        try {
            // Modified to allow both register and registerguild commands
            if((await checkIfGuildAllowed(client, interaction.guild?.id)==false) && 
               interaction.commandName!="registerguild" && 
               interaction.commandName!="register") return;

            if (interaction.isButton()) {
                try {
                    const commandName = interaction.message?.interaction?.commandName?.split(' ')[0];
                    if (commandName === 'gate') {
                        const command = client.slashCommands.get(commandName);
                        if (command?.handleButton) {
                            await safeDefer(interaction, { ephemeral: true });
                            await command.handleButton(interaction, { database });
                        }
                    }
                } catch (error) {
                    await handleCommandError(interaction, error, '❌ An error occurred while processing your interaction.');
                }
                return;
            }

            if (interaction.isAutocomplete()) {
                const command = client.slashCommands.get(interaction.commandName);
                if (!command || !command.autocomplete) return;

                try {
                    await command.autocomplete(interaction);
                } catch (error) {
                    console.error('Autocomplete error:', error);
                }
                return;
            }

            if (!interaction.isChatInputCommand()) return;

            const command = client.slashCommands.get(interaction.commandName);
            if (!command) {
                console.warn(`Command not found: ${interaction.commandName}`);
                return;
            }

            const { developers } = client.config;
            const config = client.config;
            const isDeveloper = developers.includes(interaction.user.id);

            if (command.developerOnly && !isDeveloper) {
                await handleInteraction(interaction, {
                    content: 'This command is only available to developers.',
                    ephemeral: true
                });
                return;
            }

            try {
                // Defer the command response to prevent timeouts
                await safeDefer(interaction);

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

                // Log command usage
                await database.logCommand(
                    interaction.user.id,
                    interaction.user.tag,
                    interaction.guild.id,
                    interaction.guild.name,
                    interaction.commandName,
                    options
                );

                // Execute the command
                await command.execute(interaction, { database, config });
            } catch (error) {
                await handleCommandError(interaction, error);
            }
        } catch (error) {
            console.error('Error in interaction create event:', error);
            await handleCommandError(interaction, error);
        }
    },
};
