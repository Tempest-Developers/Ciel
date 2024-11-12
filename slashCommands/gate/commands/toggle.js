const { GATE_GUILD } = require('../utils/constants');

module.exports = {
    toggle: {
        subcommand: subcommand =>
            subcommand
                .setName('toggle')
                .setDescription('Toggle the gate system on/off (Lead only)'),

        async execute(interaction, { database, config }) {
            if (!config.leads.includes(interaction.user.id)) {
                return interaction.reply({
                    content: '❌ You do not have permission to use this command.',
                    ephemeral: true
                });
            }

            const { mGateServerDB } = database;
            const serverData = await mGateServerDB.findOne({ serverID: GATE_GUILD });
            const newState = !serverData.economyEnabled;

            await mGateServerDB.updateOne(
                { serverID: GATE_GUILD },
                { $set: { economyEnabled: newState } }
            );

            return interaction.reply({
                content: `✅ Gate system has been ${newState ? 'enabled' : 'disabled'}.`,
                ephemeral: true
            });
        }
    },

    togglecards: {
        subcommand: subcommand =>
            subcommand
                .setName('togglecards')
                .setDescription('Toggle card tracking on/off (Lead only)'),

        async execute(interaction, { database, config }) {
            if (!config.leads.includes(interaction.user.id)) {
                return interaction.reply({
                    content: '❌ You do not have permission to use this command.',
                    ephemeral: true
                });
            }

            const { mGateServerDB } = database;
            const serverData = await mGateServerDB.findOne({ serverID: GATE_GUILD });
            const newState = !(serverData.cardTrackingEnabled !== false);

            await mGateServerDB.updateOne(
                { serverID: GATE_GUILD },
                { $set: { cardTrackingEnabled: newState } }
            );

            return interaction.reply({
                content: `✅ Card tracking has been ${newState ? 'enabled' : 'disabled'}.`,
                ephemeral: true
            });
        }
    }
};
