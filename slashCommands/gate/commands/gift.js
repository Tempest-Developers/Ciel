const { COSTS, MAX_TOKENS_TICKET } = require('../utils/constants');
const { ensureUser } = require('../utils/database');

module.exports = {
    subcommand: subcommand =>
        subcommand
            .setName('gift')
            .setDescription('Gift a special ticket to another user (costs 500 tokens)')
            .addUserOption(option =>
                option.setName('user')
                    .setDescription('User to gift the ticket to')
                    .setRequired(true)),

    async execute(interaction, { database }) {
        // Use ensureUser utility function for sender
        const userData = await ensureUser(interaction.user.id, database.mGateDB);
        const targetUser = interaction.options.getUser('user');
        const cost = COSTS.GIFT_TICKET;

        if (userData.currency[0] < cost) {
            return interaction.reply({
                content: `❌ You need ${cost} Slime Tokens to gift a special ticket! You only have ${userData.currency[0]} Slime Tokens.`,
                ephemeral: true
            });
        }

        // Check target user's current ticket count
        const targetUserData = await ensureUser(targetUser.id, database.mGateDB);
        const targetTickets = targetUserData.currency[5] || 0;

        if (targetTickets >= MAX_TOKENS_TICKET) {
            return interaction.reply({
                content: `❌ ${targetUser.username} already has the maximum number of tickets (${MAX_TOKENS_TICKET})!`,
                ephemeral: true
            });
        }

        // Update sender's balance
        await database.mGateDB.updateOne(
            { userID: interaction.user.id },
            { $inc: { 'currency.0': -cost } }
        );

        // Update target user's balance
        await database.mGateDB.updateOne(
            { userID: targetUser.id },
            { $inc: { 'currency.5': 1 } }
        );

        return interaction.reply({
            content: `✅ Successfully gifted a Special Ticket to ${targetUser.username}! Your new balance is ${userData.currency[0] - cost} Slime Tokens.`,
            ephemeral: true
        });
    }
};
