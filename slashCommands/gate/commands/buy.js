const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { SR_PING_ROLE, COSTS, MAX_TOKENS_TICKET } = require('../utils/constants');
const { ensureUser } = require('../utils/database');
const { handleInteraction, handleCommandError, safeDefer } = require('../../../utility/interactionHandler');

module.exports = {
    subcommand: subcommand =>
        subcommand
            .setName('buy')
            .setDescription('Buy tickets or premium')
            .addStringOption(option =>
                option.setName('type')
                    .setDescription('What to buy')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Ticket', value: 'ticket' },
                        { name: 'Premium (1 week)', value: 'premium' }
                    )),

    async execute(interaction, { database }) {
        try {
            await safeDefer(interaction, { ephemeral: true });

            const type = interaction.options.getString('type');
            const userData = await ensureUser(interaction.user.id, database.mGateDB);
            const currentSlimeTokens = userData.currency[0];

            if (type === 'premium') {
                const premiumCost = COSTS.PREMIUM;
                
                if (currentSlimeTokens < premiumCost) {
                    return await handleInteraction(interaction, {
                        content: `❌ You don't have enough Slime Tokens! You need ${premiumCost} Slime Tokens but only have ${currentSlimeTokens}.`,
                        ephemeral: true
                    }, 'editReply');
                }

                if (userData.premium?.active) {
                    return await handleInteraction(interaction, {
                        content: '❌ You already have an active premium subscription!',
                        ephemeral: true
                    }, 'editReply');
                }

                const confirmButton = new ButtonBuilder()
                    .setCustomId('premium_confirm')
                    .setLabel(`Buy Premium (${premiumCost} Slime Tokens)`)
                    .setStyle(ButtonStyle.Primary);

                const cancelButton = new ButtonBuilder()
                    .setCustomId('premium_cancel')
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Secondary);

                const row = new ActionRowBuilder()
                    .addComponents(confirmButton, cancelButton);

                const response = await handleInteraction(interaction, {
                    content: `Are you sure you want to buy premium for ${premiumCost} Slime Tokens? This will last for 1 week.`,
                    components: [row],
                    ephemeral: true
                }, 'editReply');

                const collector = response.createMessageComponentCollector({
                    filter: i => i.user.id === interaction.user.id,
                    time: 30000
                });

                collector.on('collect', async i => {
                    try {
                        if (i.customId === 'premium_cancel') {
                            await handleInteraction(i, {
                                content: '❌ Purchase cancelled.',
                                components: []
                            }, 'update');
                            collector.stop();
                        }
                        else if (i.customId === 'premium_confirm') {
                            await safeDefer(i, { ephemeral: true });
                            
                            const updatedUserData = await database.mGateDB.findOne({ userID: interaction.user.id });
                            if (updatedUserData.currency[0] < premiumCost) {
                                await handleInteraction(i, {
                                    content: `❌ You don't have enough Slime Tokens! You need ${premiumCost} Slime Tokens but only have ${updatedUserData.currency[0]}.`,
                                    components: []
                                }, 'editReply');
                                return;
                            }

                            const expiresAt = new Date();
                            expiresAt.setDate(expiresAt.getDate() + 7);

                            await database.mGateDB.updateOne(
                                { userID: interaction.user.id },
                                {
                                    $inc: { 'currency.0': -premiumCost },
                                    $set: {
                                        'premium.active': true,
                                        'premium.expiresAt': expiresAt
                                    }
                                }
                            );

                            const member = await interaction.guild.members.fetch(interaction.user.id);
                            if (!member.roles.cache.has(SR_PING_ROLE)) {
                                await member.roles.add(SR_PING_ROLE);
                            }

                            await handleInteraction(i, {
                                content: `✅ Successfully purchased premium! Your new balance is ${updatedUserData.currency[0] - premiumCost} Slime Tokens.\nPremium expires <t:${Math.floor(expiresAt.getTime() / 1000)}:R>`,
                                components: []
                            }, 'editReply');
                        }
                    } catch (error) {
                        await handleCommandError(i, error, '❌ An error occurred while processing your purchase.');
                    }
                });

                collector.on('end', collected => {
                    if (collected.size === 0) {
                        handleInteraction(interaction, {
                            content: '❌ Purchase cancelled - timed out.',
                            components: []
                        }, 'editReply').catch(console.error);
                    }
                });

                return;
            }
            else if (type === 'ticket') {
                const ticketCost = COSTS.TICKET;
                const currentTickets = userData.currency[5] || 0;

                if (currentTickets >= MAX_TOKENS_TICKET) {
                    return await handleInteraction(interaction, {
                        content: `❌ You already have the maximum number of tickets (${MAX_TOKENS_TICKET})!`,
                        ephemeral: true
                    }, 'editReply');
                }

                if (currentSlimeTokens < ticketCost) {
                    return await handleInteraction(interaction, {
                        content: `❌ You don't have enough Slime Tokens! You need ${ticketCost} Slime Tokens but only have ${currentSlimeTokens}.`,
                        ephemeral: true
                    }, 'editReply');
                }

                const confirmButton = new ButtonBuilder()
                    .setCustomId('buy_confirm')
                    .setLabel(`Buy Ticket (${ticketCost} Slime Tokens)`)
                    .setStyle(ButtonStyle.Primary);

                const cancelButton = new ButtonBuilder()
                    .setCustomId('buy_cancel')
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Secondary);

                const row = new ActionRowBuilder()
                    .addComponents(confirmButton, cancelButton);

                const response = await handleInteraction(interaction, {
                    content: `Are you sure you want to buy a ticket for ${ticketCost} Slime Tokens?`,
                    components: [row],
                    ephemeral: true
                }, 'editReply');

                const collector = response.createMessageComponentCollector({
                    filter: i => i.user.id === interaction.user.id,
                    time: 30000
                });

                collector.on('collect', async i => {
                    try {
                        if (i.customId === 'buy_cancel') {
                            await handleInteraction(i, {
                                content: '❌ Purchase cancelled.',
                                components: []
                            }, 'update');
                            collector.stop();
                        }
                        else if (i.customId === 'buy_confirm') {
                            await safeDefer(i, { ephemeral: true });
                            
                            const updatedUserData = await database.mGateDB.findOne({ userID: interaction.user.id });
                            const updatedTickets = updatedUserData.currency[5] || 0;

                            if (updatedTickets >= MAX_TOKENS_TICKET) {
                                await handleInteraction(i, {
                                    content: `❌ You already have the maximum number of tickets (${MAX_TOKENS_TICKET})!`,
                                    components: []
                                }, 'editReply');
                                return;
                            }

                            if (updatedUserData.currency[0] < ticketCost) {
                                await handleInteraction(i, {
                                    content: `❌ You don't have enough Slime Tokens! You need ${ticketCost} Slime Tokens but only have ${updatedUserData.currency[0]}.`,
                                    components: []
                                }, 'editReply');
                                return;
                            }

                            await database.mGateDB.updateOne(
                                { userID: interaction.user.id },
                                {
                                    $inc: { 
                                        'currency.0': -ticketCost,
                                        'currency.5': 1
                                    }
                                }
                            );

                            await handleInteraction(i, {
                                content: `✅ Successfully purchased a ticket! Your new balance is ${updatedUserData.currency[0] - ticketCost} Slime Tokens.`,
                                components: []
                            }, 'editReply');
                        }
                    } catch (error) {
                        await handleCommandError(i, error, '❌ An error occurred while processing your purchase.');
                    }
                });

                collector.on('end', collected => {
                    if (collected.size === 0) {
                        handleInteraction(interaction, {
                            content: '❌ Purchase cancelled - timed out.',
                            components: []
                        }, 'editReply').catch(console.error);
                    }
                });

                return;
            }
        } catch (error) {
            await handleCommandError(interaction, error, '❌ An error occurred while processing your request.');
        }
    }
};
