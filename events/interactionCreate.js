const { Events } = require('discord.js');
const { checkPermissions, checkIfGuildAllowed } = require('../utility/auth');

const GATE_GUILD = '1240866080985976844';

module.exports = {
    name: Events.InteractionCreate,
    once: false,
    async execute(client, interaction) {
        // New permission check
        if (!checkPermissions(interaction.channel, interaction.client.user)) return;

        if((await checkIfGuildAllowed(client, interaction.guild.id)==false) && interaction.commandName!="registerguild") return;

        // Handle button interactions
        if (interaction.isButton()) {
            // Handle button interactions here
            const buttonHandler = interaction.client.buttons?.get(interaction.customId);
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
            const command = interaction.client.slashCommands.get(interaction.commandName);
            if (!command || !command.autocomplete ) return;

            try {
                await command.autocomplete(interaction);
            } catch (error) {
                console.error(error);
            }
            return;
        }

        if (!interaction.isChatInputCommand()) return;

        const command = interaction.client.slashCommands.get(interaction.commandName);
        if (!command) return;

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

        try {
            // Log the command usage
            const { logCommand } = interaction.client.database;
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

            await logCommand(
                interaction.user.id,
                interaction.user.tag,
                interaction.guild.id,
                interaction.guild.name,
                interaction.commandName,
                options
            );

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
