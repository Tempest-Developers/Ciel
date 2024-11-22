const { MAX_TOKENS } = require('../utils/constants');
const { ensureUser } = require('../utils/database');
const { handleInteraction, handleCommandError, safeDefer } = require('../../../utility/interactionHandler');

module.exports = {
    give: {
        subcommand: subcommand =>
            subcommand
                .setName('give')
                .setDescription('Give currency to a user (Lead only)')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User to give currency to')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('Type of currency')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Slime Tokens', value: 'tokens' },
                            { name: 'Tickets', value: 'tickets' }
                        ))
                .addIntegerOption(option =>
                    option.setName('amount')
                        .setDescription('Amount to give')
                        .setRequired(true)),

        async execute(interaction, { database, config }) {
            try {
                await safeDefer(interaction, { ephemeral: true });

                if (!config.leads.includes(interaction.user.id)) {
                    return await handleInteraction(interaction, {
                        content: '❌ You do not have permission to use this command.',
                        ephemeral: true
                    }, 'editReply');
                }

                const targetUser = interaction.options.getUser('user');
                const type = interaction.options.getString('type');
                const amount = interaction.options.getInteger('amount');

                if (amount <= 0) {
                    return await handleInteraction(interaction, {
                        content: '❌ Amount must be greater than 0.',
                        ephemeral: true
                    }, 'editReply');
                }

                // Use ensureUser utility function
                const userData = await ensureUser(targetUser.id, database.mGateDB);

                if (type === 'tokens') {
                    const newBalance = userData.currency[0] + amount;
                    if (newBalance > MAX_TOKENS) {
                        return await handleInteraction(interaction, {
                            content: `❌ This would exceed the maximum balance of ${MAX_TOKENS} Slime Tokens! Current balance: ${userData.currency[0]}`,
                            ephemeral: true
                        }, 'editReply');
                    }

                    await database.mGateDB.updateOne(
                        { userID: targetUser.id },
                        { $inc: { 'currency.0': amount } }
                    );

                    return await handleInteraction(interaction, {
                        content: `✅ Successfully gave ${amount} Slime Tokens to ${targetUser.username}. Their new balance is ${newBalance} Slime Tokens.`,
                        ephemeral: true
                    }, 'editReply');
                } else if (type === 'tickets') {
                    await database.mGateDB.updateOne(
                        { userID: targetUser.id },
                        { $inc: { 'currency.5': amount } }
                    );

                    const newTickets = (userData.currency[5] || 0) + amount;
                    return await handleInteraction(interaction, {
                        content: `✅ Successfully gave ${amount} Tickets to ${targetUser.username}. They now have ${newTickets} Tickets.`,
                        ephemeral: true
                    }, 'editReply');
                }
            } catch (error) {
                await handleCommandError(interaction, error, '❌ An error occurred while giving currency.');
            }
        }
    },

    take: {
        subcommand: subcommand =>
            subcommand
                .setName('take')
                .setDescription('Take currency from a user (Lead only)')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User to take currency from')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('Type of currency')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Slime Tokens', value: 'tokens' },
                            { name: 'Tickets', value: 'tickets' }
                        ))
                .addIntegerOption(option =>
                    option.setName('amount')
                        .setDescription('Amount to take')
                        .setRequired(true)),

        async execute(interaction, { database, config }) {
            try {
                await safeDefer(interaction, { ephemeral: true });

                if (!config.leads.includes(interaction.user.id)) {
                    return await handleInteraction(interaction, {
                        content: '❌ You do not have permission to use this command.',
                        ephemeral: true
                    }, 'editReply');
                }

                const targetUser = interaction.options.getUser('user');
                const type = interaction.options.getString('type');
                const amount = interaction.options.getInteger('amount');

                if (amount <= 0) {
                    return await handleInteraction(interaction, {
                        content: '❌ Amount must be greater than 0.',
                        ephemeral: true
                    }, 'editReply');
                }

                // Use ensureUser utility function
                const userData = await ensureUser(targetUser.id, database.mGateDB);

                if (type === 'tokens') {
                    const newBalance = userData.currency[0] - amount;
                    if (newBalance < 0) {
                        return await handleInteraction(interaction, {
                            content: `❌ This would put the user's balance below 0! Current balance: ${userData.currency[0]}`,
                            ephemeral: true
                        }, 'editReply');
                    }

                    await database.mGateDB.updateOne(
                        { userID: targetUser.id },
                        { $inc: { 'currency.0': -amount } }
                    );

                    return await handleInteraction(interaction, {
                        content: `✅ Successfully took ${amount} Slime Tokens from ${targetUser.username}. Their new balance is ${newBalance} Slime Tokens.`,
                        ephemeral: true
                    }, 'editReply');
                } else if (type === 'tickets') {
                    const currentTickets = userData.currency[5] || 0;
                    if (currentTickets < amount) {
                        return await handleInteraction(interaction, {
                            content: `❌ User doesn't have enough tickets! They only have ${currentTickets} Tickets.`,
                            ephemeral: true
                        }, 'editReply');
                    }

                    await database.mGateDB.updateOne(
                        { userID: targetUser.id },
                        { $inc: { 'currency.5': -amount } }
                    );

                    return await handleInteraction(interaction, {
                        content: `✅ Successfully took ${amount} Tickets from ${targetUser.username}. They now have ${currentTickets - amount} Tickets.`,
                        ephemeral: true
                    }, 'editReply');
                }
            } catch (error) {
                await handleCommandError(interaction, error, '❌ An error occurred while taking currency.');
            }
        }
    }
};
