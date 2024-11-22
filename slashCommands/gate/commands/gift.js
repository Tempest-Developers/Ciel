const { COSTS, MAX_TOKENS_TICKET } = require('../utils/constants');
const { ensureUser } = require('../utils/database');
const { handleInteraction, handleCommandError, safeDefer } = require('../../../utility/interactionHandler');

module.exports = {
    subcommand: subcommand =>
        subcommand
            .setName('gift')
            .setDescription(`Gift a special ticket to another user (costs ${COSTS.GIFT_TICKET} tokens)`)
            .addUserOption(option =>
                option.setName('user')
                    .setDescription('User to gift the ticket to')
                    .setRequired(true)),

    async execute(interaction, { database }) {
        try {
            await safeDefer(interaction, { ephemeral: true });

            // Use ensureUser utility function for sender
            const userData = await ensureUser(interaction.user.id, database.mGateDB);
            const targetUser = interaction.options.getUser('user');
            const cost = COSTS.GIFT_TICKET;

            // Check if user is trying to gift themselves
            if (targetUser.id === interaction.user.id) {
                return await handleInteraction(interaction, {
                    content: `❌ You cannot gift a ticket to yourself!`,
                    ephemeral: true
                }, 'editReply');
            }

            if (userData.currency[0] < cost) {
                return await handleInteraction(interaction, {
                    content: `❌ You need ${cost} Slime Tokens to gift a special ticket! You only have ${userData.currency[0]} Slime Tokens.`,
                    ephemeral: true
                }, 'editReply');
            }

            // Check target user's current ticket count
            const targetUserData = await ensureUser(targetUser.id, database.mGateDB);
            const targetTickets = targetUserData.currency[5] || 0;

            if (targetTickets >= MAX_TOKENS_TICKET) {
                return await handleInteraction(interaction, {
                    content: `❌ ${targetUser.username} already has the maximum number of tickets (${MAX_TOKENS_TICKET})!`,
                    ephemeral: true
                }, 'editReply');
            }

            try {
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

                return await handleInteraction(interaction, {
                    content: `✅ Successfully gifted a Ticket to ${targetUser.username}! Your new balance is ${userData.currency[0] - cost} Slime Tokens.`,
                    ephemeral: true
                }, 'editReply');
            } catch (dbError) {
                throw new Error('Failed to process gift transaction');
            }
        } catch (error) {
            await handleCommandError(interaction, error, '❌ An error occurred while processing the gift.');
        }
    }
};
