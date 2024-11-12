const { MAX_TOKENS } = require('../utils/constants');

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
            if (!config.leads.includes(interaction.user.id)) {
                return interaction.reply({
                    content: '❌ You do not have permission to use this command.',
                    ephemeral: true
                });
            }

            const targetUser = interaction.options.getUser('user');
            const type = interaction.options.getString('type');
            const amount = interaction.options.getInteger('amount');

            if (amount <= 0) {
                return interaction.reply({
                    content: '❌ Amount must be greater than 0.',
                    ephemeral: true
                });
            }

            // Use gate functions from mongo.js
            let userData = await database.mongo.getGateUser(targetUser.id);
            if (!userData) {
                await database.mongo.createGateUser(targetUser.id);
                userData = await database.mongo.getGateUser(targetUser.id);
            }

            if (type === 'tokens') {
                const newBalance = userData.currency[0] + amount;
                if (newBalance > MAX_TOKENS) {
                    return interaction.reply({
                        content: `❌ This would exceed the maximum balance of ${MAX_TOKENS} Slime Tokens! Current balance: ${userData.currency[0]}`,
                        ephemeral: true
                    });
                }

                await database.mongo.mGateDB.updateOne(
                    { userID: targetUser.id },
                    { $inc: { 'currency.0': amount } }
                );

                return interaction.reply({
                    content: `✅ Successfully gave ${amount} Slime Tokens to ${targetUser.username}. Their new balance is ${newBalance} Slime Tokens.`,
                    ephemeral: true
                });
            } else if (type === 'tickets') {
                await database.mongo.mGateDB.updateOne(
                    { userID: targetUser.id },
                    { $inc: { 'currency.5': amount } }
                );

                const newTickets = (userData.currency[5] || 0) + amount;
                return interaction.reply({
                    content: `✅ Successfully gave ${amount} Tickets to ${targetUser.username}. They now have ${newTickets} Tickets.`,
                    ephemeral: true
                });
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
            if (!config.leads.includes(interaction.user.id)) {
                return interaction.reply({
                    content: '❌ You do not have permission to use this command.',
                    ephemeral: true
                });
            }

            const targetUser = interaction.options.getUser('user');
            const type = interaction.options.getString('type');
            const amount = interaction.options.getInteger('amount');

            if (amount <= 0) {
                return interaction.reply({
                    content: '❌ Amount must be greater than 0.',
                    ephemeral: true
                });
            }

            // Use gate functions from mongo.js
            let userData = await database.mongo.getGateUser(targetUser.id);
            if (!userData) {
                await database.mongo.createGateUser(targetUser.id);
                userData = await database.mongo.getGateUser(targetUser.id);
            }

            if (type === 'tokens') {
                const newBalance = userData.currency[0] - amount;
                if (newBalance < 0) {
                    return interaction.reply({
                        content: `❌ This would put the user's balance below 0! Current balance: ${userData.currency[0]}`,
                        ephemeral: true
                    });
                }

                await database.mongo.mGateDB.updateOne(
                    { userID: targetUser.id },
                    { $inc: { 'currency.0': -amount } }
                );

                return interaction.reply({
                    content: `✅ Successfully took ${amount} Slime Tokens from ${targetUser.username}. Their new balance is ${newBalance} Slime Tokens.`,
                    ephemeral: false
                });
            } else if (type === 'tickets') {
                const currentTickets = userData.currency[5] || 0;
                if (currentTickets < amount) {
                    return interaction.reply({
                        content: `❌ User doesn't have enough tickets! They only have ${currentTickets} Tickets.`,
                        ephemeral: true
                    });
                }

                await database.mongo.mGateDB.updateOne(
                    { userID: targetUser.id },
                    { $inc: { 'currency.5': -amount } }
                );

                return interaction.reply({
                    content: `✅ Successfully took ${amount} Tickets from ${targetUser.username}. They now have ${currentTickets - amount} Tickets.`,
                    ephemeral: false
                });
            }
        }
    }
};
