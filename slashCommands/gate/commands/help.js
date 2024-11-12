const { EmbedBuilder } = require('discord.js');

module.exports = {
    subcommand: subcommand =>
        subcommand
            .setName('help')
            .setDescription('Show gate system commands and information'),

    async execute(interaction, { database, config }) {
        const { mGateServerDB } = database;
        const serverData = await mGateServerDB.findOne({ serverID: interaction.guild.id });
        const isLead = config.leads.includes(interaction.user.id);

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('<:Slime_Token:1304929154285703179> Gate System')
            .setDescription(
                `Gate system is currently **${serverData.economyEnabled ? 'enabled' : 'disabled'}**\n` +
                `Card tracking is currently **${serverData.cardTrackingEnabled !== false ? 'enabled' : 'disabled'}**`
            );

        if (isLead) {
            embed.addFields(
                { name: 'Lead Commands', value: 
                    '`/gate toggle` - Enable/disable gate system\n' +
                    '`/gate togglecards` - Enable/disable card tracking\n' +
                    '`/gate give <user> <type> <amount>` - Give tokens/tickets to user\n' +
                    '`/gate take <user> <type> <amount>` - Take tokens/tickets from user\n' +
                    '`/gate balance <user>` - Check user\'s balance\n' +
                    '**Cooldown**: 5 seconds', inline: false },
            );
        }

        embed.addFields(
            { name: 'User Commands', value: 
                '`/gate balance` - Check your balance\n' +
                '`/gate buy ticket` - Buy a ticket (500 tokens)\n' +
                '`/gate buy premium` - Buy premium (1000 tokens, 1 day)\n' +
                '`/gate gift <user>` - Gift special ticket (500 tokens)\n' +
                '`/gate giveaway` - View giveaway rewards\n' +
                '**Cooldown**: 10 seconds', inline: false },
            { name: 'Information', value:
                '• Earn 0-10 Slime Tokens from claiming cards\n' +
                '• Maximum balance: 25,000 Slime Tokens\n' +
                '• Regular ticket: 500 Slime Tokens\n' +
                '• Special Gift Ticket: 500 Slime Tokens\n' +
                '• Premium (1 day): 1000 Slime Tokens\n' +
                '• Premium benefits: SR-ping role', inline: false }
        );

        return interaction.reply({
            embeds: [embed],
            ephemeral: true
        });
    }
};
