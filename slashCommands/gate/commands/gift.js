const { COSTS } = require('../utils/constants');

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
        // Use gate functions from mongo.js
        let userData = await database.mongo.getGateUser(interaction.user.id);
        if (!userData) {
            await database.mongo.createGateUser(interaction.user.id);
            userData = await database.mongo.getGateUser(interaction.user.id);
        }

        const targetUser = interaction.options.getUser('user');
        const cost = COSTS.GIFT_TICKET;

        if (userData.currency[0] < cost) {
            return interaction.reply({
                content: `❌ You need ${cost} Slime Tokens to gift a special ticket! You only have ${userData.currency[0]} Slime Tokens.`,
                ephemeral: true
            });
        }

        // Update sender's balance
        await database.mongo.mGateDB.updateOne(
            { userID: interaction.user.id },
            { $inc: { 'currency.0': -cost } }
        );

        // Ensure target user exists and update their balance
        let targetUserData = await database.mongo.getGateUser(targetUser.id);
        if (!targetUserData) {
            await database.mongo.createGateUser(targetUser.id);
        }
        await database.mongo.mGateDB.updateOne(
            { userID: targetUser.id },
            { $inc: { 'currency.5': 1 } }
        );

        return interaction.reply({
            content: `✅ Successfully gifted a Special Ticket to ${targetUser.username}! Your new balance is ${userData.currency[0] - cost} Slime Tokens.`,
            ephemeral: true
        });
    }
};
