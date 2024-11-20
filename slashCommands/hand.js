const { SlashCommandBuilder } = require('discord.js');
const { toggleHandler } = require('../database/modules/server');

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
                return await interaction.reply({
                    content: 'You are not authorized to use this command.',
                    ephemeral: true
                });
            }

            // Only allow command in developer's server
            if (interaction.guild.id !== process.env.MIMS_GUILD) {
                return await interaction.reply({
                    content: 'This command can only be used in the development server.',
                    ephemeral: true
                });
            }

            const handlerType = interaction.options.getString('type');
            const targetServerId = interaction.options.getString('server');

            // Verify the server exists and bot has access to it
            try {
                const guild = await interaction.client.guilds.fetch(targetServerId);
                if (!guild) {
                    return await interaction.reply({
                        content: 'Unable to find the specified server. Please check the server ID.',
                        ephemeral: true
                    });
                }
            } catch (error) {
                return await interaction.reply({
                    content: 'Unable to access the specified server. Please verify the server ID and ensure the bot has access to it.',
                    ephemeral: true
                });
            }

            // Toggle the handler for the specified server
            try {
                const toggleResult = await toggleHandler(targetServerId, handlerType, interaction.user.id);
                const responseMessage = `Handler '${handlerType}' ${toggleResult.enabled ? 'enabled' : 'disabled'} for server ${targetServerId}.`;
                console.log(`Developer command - hand: ${JSON.stringify(toggleResult)}`);

                await interaction.reply({
                    content: responseMessage,
                    ephemeral: true
                });
            } catch (error) {
                if (error.message === 'Server settings not found') {
                    return await interaction.reply({
                        content: 'Server settings not found. Please ensure the server is properly configured first.',
                        ephemeral: true
                    });
                }
                throw error; // Re-throw other errors to be caught by outer catch block
            }

        } catch (error) {
            console.error('Error in hand command:', error);
            await interaction.reply({
                content: 'There was an error while executing this command.',
                ephemeral: true
            });
        }
    },
};
