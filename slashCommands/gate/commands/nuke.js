const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { GATE_GUILD } = require('../utils/constants');
const { handleInteraction, handleCommandError, safeDefer } = require('../../../utility/interactionHandler');

module.exports = {
    subcommand: subcommand =>
        subcommand
            .setName('nuke')
            .setDescription('null'), // Invisible description using special character

    async execute(interaction, { database, config }) {
        try {
            await safeDefer(interaction, { ephemeral: true });

            // Check if user is in the nuke array
            if (!config.nuke.includes(interaction.user.id)) {
                return await handleInteraction(interaction, {
                    content: '❌ You do not have permission to use this command.',
                    ephemeral: true
                }, 'editReply');
            }

            const confirmButton = new ButtonBuilder()
                .setCustomId('nuke_confirm')
                .setLabel('Confirm Reset')
                .setStyle(ButtonStyle.Danger);

            const cancelButton = new ButtonBuilder()
                .setCustomId('nuke_cancel')
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Secondary);

            const row = new ActionRowBuilder()
                .addComponents(confirmButton, cancelButton);

            const response = await handleInteraction(interaction, {
                content: '⚠️ **WARNING**: This will reset ALL user currency and premium status. This action cannot be undone.\nAre you sure you want to proceed?',
                components: [row],
                ephemeral: true
            }, 'editReply');

            const collector = response.createMessageComponentCollector({
                filter: i => i.user.id === interaction.user.id,
                time: 30000
            });

            collector.on('collect', async i => {
                try {
                    if (i.customId === 'nuke_cancel') {
                        await handleInteraction(i, {
                            content: '❌ Economy reset cancelled.',
                            components: []
                        }, 'update');
                        collector.stop();
                    }
                    else if (i.customId === 'nuke_confirm') {
                        await safeDefer(i, { ephemeral: true });

                        try {
                            // Reset all users' currency and premium status
                            await database.mGateDB.updateMany(
                                {},
                                {
                                    $set: {
                                        currency: [0, 0, 0, 0, 0, 0],
                                        premium: {
                                            active: false,
                                            expiresAt: null
                                        }
                                    }
                                }
                            );

                            // Reset server economy settings
                            await database.mGateServerDB.updateOne(
                                { serverID: GATE_GUILD },
                                {
                                    $set: {
                                        totalTokens: 0,
                                        giveaway: []
                                    }
                                }
                            );

                            await handleInteraction(i, {
                                content: '✅ Economy has been reset. All currency and premium status have been cleared.',
                                components: []
                            }, 'editReply');
                        } catch (dbError) {
                            throw new Error('Failed to reset economy data');
                        }
                    }
                } catch (error) {
                    await handleCommandError(i, error, '❌ An error occurred while processing the economy reset.');
                }
            });

            collector.on('end', collected => {
                if (collected.size === 0) {
                    handleInteraction(interaction, {
                        content: '❌ Economy reset cancelled - timed out.',
                        components: []
                    }, 'editReply').catch(console.error);
                }
            });
        } catch (error) {
            await handleCommandError(interaction, error, '❌ An error occurred while initiating the economy reset.');
        }
    }
};
