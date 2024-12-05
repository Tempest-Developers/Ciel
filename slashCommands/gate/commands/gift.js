const { COSTS, MAX_TOKENS_TICKET } = require('../utils/constants');
const { ensureUser } = require('../utils/database');
const { handleInteraction, handleCommandError, safeDefer } = require('../../../utility/interactionHandler');
const { applyCooldown, checkCooldown } = require('../utils/cooldown');

const COOLDOWN = 30; // 30 seconds cooldown

module.exports = {
    subcommand: subcommand =>
        subcommand
            .setName('gift')
            .setDescription(`Gift a special ticket to another user (costs ${COSTS.GIFT_TICKET} tokens)`)
            .addUserOption(option =>
                option.setName('user')
                    .setDescription('User to gift the tickets to')
                    .setRequired(true))
            .addIntegerOption(option =>
                option.setName('amount')
                    .setDescription('Number of tickets to gift')
                    .setRequired(true)
                    .setMinValue(1)
                    .setMaxValue(MAX_TOKENS_TICKET)),

    async execute(interaction, { database }) {
        try {
            await safeDefer(interaction, { ephemeral: true });

            // Check cooldown
            const cooldownResult = await checkCooldown(interaction.user.id, 'gift', database);
            if (cooldownResult) {
                return await handleInteraction(interaction, {
                    content: `❌ This command is on cooldown. Please try again in ${cooldownResult} seconds.`,
                    ephemeral: true
                }, 'editReply');
            }

            const userData = await ensureUser(interaction.user.id, database.mGateDB);
            const targetUser = interaction.options.getUser('user');
            const amount = interaction.options.getInteger('amount');

            // Additional check to ensure amount is a positive integer
            if (!Number.isInteger(amount) || amount <= 0 || amount > MAX_TOKENS_TICKET) {
                return await handleInteraction(interaction, {
                    content: `❌ Invalid amount. Please enter a positive integer between 1 and ${MAX_TOKENS_TICKET}.`,
                    ephemeral: true
                }, 'editReply');
            }

            const totalCost = COSTS.GIFT_TICKET * amount;

            // Check if user is trying to gift themselves
            if (targetUser.id === interaction.user.id) {
                return await handleInteraction(interaction, {
                    content: `❌ You cannot gift tickets to yourself!`,
                    ephemeral: true
                }, 'editReply');
            }

            if (userData.currency[0] < totalCost) {
                return await handleInteraction(interaction, {
                    content: `❌ You need ${totalCost} Slime Tokens to gift ${amount} special ticket(s)! You only have ${userData.currency[0]} Slime Tokens.`,
                    ephemeral: true
                }, 'editReply');
            }

            // Check target user's current ticket count
            const targetUserData = await ensureUser(targetUser.id, database.mGateDB);
            const targetTickets = targetUserData.currency[5] || 0;

            if (targetTickets + amount > MAX_TOKENS_TICKET) {
                return await handleInteraction(interaction, {
                    content: `❌ ${targetUser.username} can't receive ${amount} ticket(s). It would exceed the maximum limit of ${MAX_TOKENS_TICKET} tickets.`,
                    ephemeral: true
                }, 'editReply');
            }

            try {
                // Update sender's balance
                await database.mGateDB.updateOne(
                    { userID: interaction.user.id },
                    { $inc: { 'currency.0': -totalCost } }
                );

                // Update target user's balance
                await database.mGateDB.updateOne(
                    { userID: targetUser.id },
                    { $inc: { 'currency.5': amount } }
                );

                // Apply cooldown
                await applyCooldown(interaction.user.id, 'gift', COOLDOWN, database);

                return await handleInteraction(interaction, {
                    content: `✅ Successfully gifted ${amount} Ticket(s) to ${targetUser.username}! Your new balance is ${userData.currency[0] - totalCost} Slime Tokens.`,
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
