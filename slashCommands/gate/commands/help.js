const { EmbedBuilder } = require('discord.js');
const { getServerData } = require('../utils/database');
const constants = require('../utils/constants');

module.exports = {
    subcommand: subcommand =>
        subcommand
            .setName('help')
            .setDescription('Show gate system commands and information'),

    async execute(interaction, { database, config }) {
        // Use getServerData utility function
        const serverData = await getServerData(interaction.guild.id, database.mGateServerDB);
        const isLead = config.leads.includes(interaction.user.id);

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('<:Slime_Token:1304929154285703179> Gate System')
            // .setDescription(
            //     `Gate system is currently **${serverData.economyEnabled ? 'enabled' : 'disabled'}**\n` +
            //     `Card tracking is currently **${serverData.cardTrackingEnabled !== false ? 'enabled' : 'disabled'}**`
            // );

        // if (isLead) {
        //     embed.addFields(
        //         { name: 'Lead Commands', value: 
        //             '`/gate toggle` - Enable/Disable gate system\n' +
        //             '`/gate togglecards` - Enable/Disable card tracking\n' +
        //             '`/gate give <user> <type> <amount>` - Give tokens/tickets to user\n' +
        //             '`/gate take <user> <type> <amount>` - Take tokens/tickets from user\n' +
        //             '`/gate balance <user>` - Check user\'s balance\n' +
        //             '**Cooldown**: 5 seconds', inline: false },
        //     );
        // }

        embed.addFields(
            { name: 'User Commands', value: 
                `\`/gate balance\` - Check your balance\n` +
                `\`/gate buy ticket\` - Buy a ticket (${constants.COSTS.TICKET} tokens)\n` +
                `\`/gate buy premium\` - Buy premium (${constants.COSTS.PREMIUM} tokens, 1 week)\n` +
                `\`/gate gift <user>\` - Gift special ticket (${constants.COSTS.GIFT_TICKET} tokens)\n` +
                `\`/gate giveaway\` - View giveaway rewards\n` +
                `**Cooldown**: ${constants.USER_COOLDOWN} seconds`, inline: false },
            { name: 'Information', value:
                `• Earn 0-5 Slime Tokens or rarely 100 by chatting while claiming cards\n` +
                `• Maximum balance: ${constants.MAX_TOKENS} Slime Tokens\n` +
                `• Regular ticket: ${constants.COSTS.TICKET} Slime Tokens\n` +
                `• Special Gift Ticket: ${constants.COSTS.GIFT_TICKET} Slime Tokens\n` +
                `• Premium (1 week): ${constants.COSTS.PREMIUM} Slime Tokens\n` +
                `• Premium benefits: High-Tier-Ping role`, inline: false }
        );

        return interaction.reply({
            embeds: [embed],
            ephemeral: false
        });
    }
};
