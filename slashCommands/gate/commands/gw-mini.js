const { EmbedBuilder } = require('discord.js');
const { handleInteraction, handleCommandError, safeDefer } = require('../../../utility/interactionHandler');

module.exports = {
    subcommand: subcommand =>
        subcommand
            .setName('gw-mini')
            .setDescription('Select winners for a giveaway')
            .addIntegerOption(option =>
                option.setName('giveaway_id')
                    .setDescription('ID of the giveaway')
                    .setRequired(true))
            .addIntegerOption(option =>
                option.setName('winners')
                    .setDescription('Number of winners to select')
                    .setRequired(true))
            .addBooleanOption(option =>
                option.setName('allow_previous')
                    .setDescription('Allow previous winners')
                    .setRequired(true))
            .addBooleanOption(option =>
                option.setName('unique_winners')
                    .setDescription('Select unique winners or based on entries')
                    .setRequired(true))
            .addStringOption(option =>
                option.setName('message')
                    .setDescription('Custom message for the giveaway')
                    .setRequired(false)),

    async execute(interaction, { database, config }) {
        if (!config.leads.includes(interaction.user.id)) {
            return await handleInteraction(interaction, {
                content: '❌ You do not have permission to use this command.',
                ephemeral: true
            }, 'reply');
        }

        await safeDefer(interaction, { ephemeral: false });

        try {
            const giveawayId = interaction.options.getInteger('giveaway_id');
            const winnerCount = interaction.options.getInteger('winners');
            const allowPrevious = interaction.options.getBoolean('allow_previous');
            const uniqueWinners = interaction.options.getBoolean('unique_winners');
            const customMessage = interaction.options.getString('message') || 'Congratulations to the winners!';

            const giveaway = await database.getGiveaway(giveawayId);

            if (!giveaway) {
                return await handleInteraction(interaction, {
                    content: '❌ Giveaway not found.',
                    ephemeral: true
                }, 'editReply');
            }

            let entries = giveaway.entries || [];
            let winners = [];

            if (!allowPrevious && giveaway.winners && giveaway.winners.length > 0) {
                entries = entries.filter(entry => !giveaway.winners.includes(entry.userID));
            }

            if (uniqueWinners) {
                const uniqueEntries = [...new Set(entries.map(entry => entry.userID))];
                winners = this.getRandomElements(uniqueEntries, winnerCount);
            } else {
                winners = this.getRandomElements(entries.map(entry => entry.userID), winnerCount);
            }

            const winnerDetails = await Promise.all(winners.map(async (winnerId) => {
                const user = await interaction.client.users.fetch(winnerId);
                return `<@${winnerId}> (${user.tag})`;
            }));

            const description = `${customMessage}\n\n` +
                                `**Winners:**\n${winnerDetails.join('\n')}\n\n` +
                                `**Total Entries:** ${entries.length}\n` +
                                `**Unique Participants:** ${new Set(entries.map(e => e.userID)).size}`;

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle(`🎉 Giveaway Winners (ID: ${giveawayId})`)
                .setDescription(description)
                .setTimestamp();

            const winnerPings = winners.map(id => `<@${id}>`).join(' ');

            // Update the giveaway in the database with the new winners
            await database.mGiveawayDB.updateOne(
                { giveawayID: giveawayId },
                { $push: { winners: { $each: winners } } }
            );

            await handleInteraction(interaction, { 
                content: `Congratulations to the winners! ${winnerPings}`,
                embeds: [embed],
                ephemeral: false 
            }, 'editReply');
        } catch (error) {
            await handleCommandError(interaction, error, '❌ An error occurred while processing the giveaway.');
        }
    },

    getRandomElements(array, count) {
        const shuffled = array.sort(() => 0.5 - Math.random());
        return shuffled.slice(0, count);
    },
};
