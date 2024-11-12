const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { SR_PING_ROLE, COSTS } = require('../utils/constants');

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
                        { name: 'Premium (1 day)', value: 'premium' }
                    )),

    async execute(interaction, { database }) {
        const type = interaction.options.getString('type');
        
        // Use gate functions from mongo.js
        let userData = await database.mongo.getGateUser(interaction.user.id);
        if (!userData) {
            await database.mongo.createGateUser(interaction.user.id);
            userData = await database.mongo.getGateUser(interaction.user.id);
        }

        const currentSlimeTokens = userData.currency[0];

        if (type === 'premium') {
            const premiumCost = COSTS.PREMIUM;
            
            if (currentSlimeTokens < premiumCost) {
                return interaction.reply({
                    content: `❌ You don't have enough Slime Tokens! You need ${premiumCost} Slime Tokens but only have ${currentSlimeTokens}.`,
                    ephemeral: true
                });
            }

            if (userData.premium?.active) {
                return interaction.reply({
                    content: '❌ You already have an active premium subscription!',
                    ephemeral: true
                });
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

            const response = await interaction.reply({
                content: `Are you sure you want to buy premium for ${premiumCost} Slime Tokens? This will last for 1 day.`,
                components: [row],
                ephemeral: true
            });

            const collector = response.createMessageComponentCollector({
                filter: i => i.user.id === interaction.user.id,
                time: 30000
            });

            collector.on('collect', async i => {
                if (i.customId === 'premium_cancel') {
                    await i.update({
                        content: '❌ Purchase cancelled.',
                        components: []
                    });
                    collector.stop();
                }
                else if (i.customId === 'premium_confirm') {
                    const updatedUserData = await database.mongo.getGateUser(interaction.user.id);
                    if (updatedUserData.currency[0] < premiumCost) {
                        await i.update({
                            content: `❌ You don't have enough Slime Tokens! You need ${premiumCost} Slime Tokens but only have ${updatedUserData.currency[0]}.`,
                            components: []
                        });
                        return;
                    }

                    const expiresAt = new Date();
                    expiresAt.setDate(expiresAt.getDate() + 1);

                    await database.mongo.mGateDB.updateOne(
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
                    const hasRole = member.roles.cache.has(SR_PING_ROLE);

                    if (!hasRole) {
                        await member.roles.add(SR_PING_ROLE);
                    }

                    await i.update({
                        content: `✅ Successfully purchased premium! Your new balance is ${updatedUserData.currency[0] - premiumCost} Slime Tokens.\nPremium expires <t:${Math.floor(expiresAt.getTime() / 1000)}:R>`,
                        components: []
                    });
                }
            });

            collector.on('end', collected => {
                if (collected.size === 0) {
                    interaction.editReply({
                        content: '❌ Purchase cancelled - timed out.',
                        components: []
                    });
                }
            });

            return;
        }
        else if (type === 'ticket') {
            const ticketCost = COSTS.TICKET;

            if (currentSlimeTokens < ticketCost) {
                return interaction.reply({
                    content: `❌ You don't have enough Slime Tokens! You need ${ticketCost} Slime Tokens but only have ${currentSlimeTokens}.`,
                    ephemeral: true
                });
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

            const response = await interaction.reply({
                content: `Are you sure you want to buy a ticket for ${ticketCost} Slime Tokens?`,
                components: [row],
                ephemeral: true
            });

            const collector = response.createMessageComponentCollector({
                filter: i => i.user.id === interaction.user.id,
                time: 30000
            });

            collector.on('collect', async i => {
                if (i.customId === 'buy_cancel') {
                    await i.update({
                        content: '❌ Purchase cancelled.',
                        components: []
                    });
                    collector.stop();
                }
                else if (i.customId === 'buy_confirm') {
                    const updatedUserData = await database.mongo.getGateUser(interaction.user.id);
                    if (updatedUserData.currency[0] < ticketCost) {
                        await i.update({
                            content: `❌ You don't have enough Slime Tokens! You need ${ticketCost} Slime Tokens but only have ${updatedUserData.currency[0]}.`,
                            components: []
                        });
                        return;
                    }

                    await database.mongo.mGateDB.updateOne(
                        { userID: interaction.user.id },
                        {
                            $inc: { 
                                'currency.0': -ticketCost,
                                'currency.5': 1
                            }
                        }
                    );

                    await i.update({
                        content: `✅ Successfully purchased a ticket! Your new balance is ${updatedUserData.currency[0] - ticketCost} Slime Tokens.`,
                        components: []
                    });
                }
            });

            collector.on('end', collected => {
                if (collected.size === 0) {
                    interaction.editReply({
                        content: '❌ Purchase cancelled - timed out.',
                        components: []
                    });
                }
            });

            return;
        }
    }
};
