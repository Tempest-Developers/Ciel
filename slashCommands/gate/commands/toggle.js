const { GATE_GUILD } = require('../utils/constants');
const { getServerData } = require('../utils/database');
const { handleInteraction, handleCommandError, safeDefer } = require('../../../utility/interactionHandler');

module.exports = {
    toggle: {
        subcommand: subcommand =>
            subcommand
                .setName('toggle')
                .setDescription('Toggle the gate system on/off (Lead only)'),

        async execute(interaction, { database, config }) {
            try {
                await safeDefer(interaction, { ephemeral: true });

                if (!config.leads.includes(interaction.user.id)) {
                    return await handleInteraction(interaction, {
                        content: '❌ You do not have permission to use this command.',
                        ephemeral: true
                    }, 'editReply');
                }

                // Use getServerData utility function
                const serverData = await getServerData(GATE_GUILD, database.mGateServerDB);
                const newState = !serverData.economyEnabled;

                try {
                    // Update server data directly using mGateServerDB
                    await database.mGateServerDB.updateOne(
                        { serverID: GATE_GUILD },
                        { $set: { economyEnabled: newState } }
                    );

                    return await handleInteraction(interaction, {
                        content: `✅ Gate system has been ${newState ? 'enabled' : 'disabled'}.`,
                        ephemeral: true
                    }, 'editReply');
                } catch (dbError) {
                    throw new Error('Failed to update gate system state');
                }
            } catch (error) {
                await handleCommandError(interaction, error, '❌ An error occurred while toggling the gate system.');
            }
        }
    },

    togglecards: {
        subcommand: subcommand =>
            subcommand
                .setName('togglecards')
                .setDescription('Toggle card tracking on/off (Lead only)'),

        async execute(interaction, { database, config }) {
            try {
                await safeDefer(interaction, { ephemeral: true });

                if (!config.leads.includes(interaction.user.id)) {
                    return await handleInteraction(interaction, {
                        content: '❌ You do not have permission to use this command.',
                        ephemeral: true
                    }, 'editReply');
                }

                // Use getServerData utility function
                const serverData = await getServerData(GATE_GUILD, database.mGateServerDB);
                const newState = !(serverData.cardTrackingEnabled !== false);

                try {
                    // Update server data directly using mGateServerDB
                    await database.mGateServerDB.updateOne(
                        { serverID: GATE_GUILD },
                        { $set: { cardTrackingEnabled: newState } }
                    );

                    return await handleInteraction(interaction, {
                        content: `✅ Card tracking has been ${newState ? 'enabled' : 'disabled'}.`,
                        ephemeral: true
                    }, 'editReply');
                } catch (dbError) {
                    throw new Error('Failed to update card tracking state');
                }
            } catch (error) {
                await handleCommandError(interaction, error, '❌ An error occurred while toggling card tracking.');
            }
        }
    }
};
