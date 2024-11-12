const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { GATE_GUILD } = require('../utils/constants');

module.exports = {
    subcommand: subcommand =>
        subcommand
            .setName('nuke')
            .setDescription('null'), // Invisible description using special character

    async execute(interaction, { database, config }) {
        // Check if user is in the nuke array
        if (!config.nuke.includes(interaction.user.id)) {
            return interaction.reply({
                content: '❌ You do not have permission to use this command.',
                ephemeral: true
            });
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

        const response = await interaction.reply({
            content: '⚠️ **WARNING**: This will reset ALL user currency and premium status. This action cannot be undone.\nAre you sure you want to proceed?',
            components: [row],
            ephemeral: true
        });

        const collector = response.createMessageComponentCollector({
            filter: i => i.user.id === interaction.user.id,
            time: 30000
        });

        collector.on('collect', async i => {
            if (i.customId === 'nuke_cancel') {
                await i.update({
                    content: '❌ Economy reset cancelled.',
                    components: []
                });
                collector.stop();
            }
            else if (i.customId === 'nuke_confirm') {
                // Reset all users' currency and premium status using gate functions
                const gateDB = database.mongo.mGateDB;
                const gateServerDB = database.mongo.mGateServerDB;
                
                // Reset all users
                await gateDB.updateMany(
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
                await gateServerDB.updateOne(
                    { serverID: GATE_GUILD },
                    {
                        $set: {
                            totalTokens: 0,
                            giveaway: []
                        }
                    }
                );

                await i.update({
                    content: '✅ Economy has been reset. All currency and premium status have been cleared.',
                    components: []
                });
            }
        });

        collector.on('end', collected => {
            if (collected.size === 0) {
                interaction.editReply({
                    content: '❌ Economy reset cancelled - timed out.',
                    components: []
                });
            }
        });
    }
};
