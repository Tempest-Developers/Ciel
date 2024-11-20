const { SlashCommandBuilder } = require('discord.js');

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

            // Toggle the handler for the specified server
            const toggleResult = await interaction.client.database.toggleHandler(targetServerId, handlerType, interaction.user.id);

            const responseMessage = `Handler '${handlerType}' ${toggleResult.enabled ? 'enabled' : 'disabled'} for server ${targetServerId}.`;
            console.log(`Developer command - hand: ${JSON.stringify(toggleResult)}`);

            await interaction.reply({
                content: responseMessage,
                ephemeral: true
            });

        } catch (error) {
            console.error('Error in hand command:', error);
            await interaction.reply({
                content: 'There was an error while executing this command.',
                ephemeral: true
            });
        }
    },
};
