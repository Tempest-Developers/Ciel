const { SlashCommandBuilder } = require('discord.js');
const { toggleHandler, createServerSettings, getServerSettings } = require('../database/modules/server');
const { handleInteraction, handleCommandError, safeDefer } = require('../utility/interactionHandler');
require('dotenv').config();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('hand')
        .setDescription('Toggle server handlers (Developer only)')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Handler type to toggle')
                .setRequired(true)
                .addChoices(
                    { name: 'claim', value: 'claim' },
                    { name: 'summ', value: 'summon' },
                    { name: 'mclaim', value: 'manualClaim' },
                    { name: 'msumm', value: 'manualSummon' }
                ))
        .addStringOption(option =>
            option.setName('server')
                .setDescription('Server ID to configure')
                .setRequired(true)),

    async execute(interaction) {
        try {
            // Only allow specific user to use this command
            if (interaction.user.id !== '292675388180791297') {
                return await handleInteraction(interaction, {
                    content: 'You are not authorized to use this command.',
                    ephemeral: true
                }, 'reply');
            }

            // Only allow command in developer's server
            if (interaction.guild.id !== process.env.MIMS_GUILD) {
                return await handleInteraction(interaction, {
                    content: 'This command can only be used in the development server.',
                    ephemeral: true
                }, 'reply');
            }

            await safeDefer(interaction);

            const handlerType = interaction.options.getString('type');
            const targetServerId = interaction.options.getString('server');

            // Verify the server exists and bot has access to it
            try {
                const guild = await interaction.client.guilds.fetch(targetServerId);
                if (!guild) {
                    return await handleInteraction(interaction, {
                        content: 'Unable to find the specified server. Please check the server ID.',
                        ephemeral: true
                    }, 'editReply');
                }

                // Check if server settings exist, create if they don't
                let serverSettings = await getServerSettings(targetServerId);
                if (!serverSettings) {
                    await createServerSettings(targetServerId);
                    serverSettings = await getServerSettings(targetServerId);
                    if (!serverSettings) {
                        return await handleInteraction(interaction, {
                            content: 'Failed to create server settings.',
                            ephemeral: true
                        }, 'editReply');
                    }
                }

                // Verify settings structure
                if (!serverSettings.settings?.handlers) {
                    return await handleInteraction(interaction, {
                        content: 'Server settings are corrupted. Please contact the developer.',
                        ephemeral: true
                    }, 'editReply');
                }

                // Toggle the handler for the specified server
                const toggleResult = await toggleHandler(targetServerId, handlerType, interaction.user.id);
                const responseMessage = `Handler '${handlerType}' ${toggleResult.enabled ? 'enabled' : 'disabled'} for server ${guild.name} (${targetServerId}).`;
                console.log(`Developer command - hand: ${JSON.stringify(toggleResult)}`);

                await handleInteraction(interaction, {
                    content: responseMessage,
                    ephemeral: true
                }, 'editReply');

            } catch (error) {
                if (error.code === 10004) { // Discord API error for unknown guild
                    return await handleInteraction(interaction, {
                        content: 'Unable to access the specified server. Please verify the server ID and ensure the bot has access to it.',
                        ephemeral: true
                    }, 'editReply');
                }
                throw error;
            }

        } catch (error) {
            await handleCommandError(interaction, error, 'There was an error while executing this command.');
        }
    },
};
