const { SlashCommandBuilder, EmbedBuilder, Collection, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { PermissionsBitField } = require('discord.js');

const GATE_GUILD = '1240866080985976844';

// Cooldowns
const cooldowns = new Collection();
const LEAD_COOLDOWN = 5; // 5 seconds for leads
const USER_COOLDOWN = 10; // 10 seconds for regular users

// Nuke confirmation tracking
const nukeConfirmations = new Collection();

// Buy confirmations tracking
const buyConfirmations = new Collection();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gate')
        .setDescription('Gate system commands')
        .addSubcommand(subcommand =>
            subcommand
                .setName('null')
                .setDescription('null'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('help')
                .setDescription('Show gate system commands and information'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('toggle')
                .setDescription('Toggle the gate system on/off (Lead only)'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('togglecards')
                .setDescription('Toggle card tracking on/off (Lead only)'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('balance')
                .setDescription('Check tickets and token balance')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User to check tickets for (Lead only)')))
        .addSubcommand(subcommand =>
            subcommand
                .setName('buy')
                .setDescription('Buy a ticket with Slime Tokens'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('gift')
                .setDescription('Gift a special ticket to another user (costs 10000 tokens)')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User to gift the ticket to')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('giveaway')
                .setDescription('Show giveaway details and rewards'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('give')
                .setDescription('Give Slime Tokens to a user (Lead only)')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User to give tokens to')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('amount')
                        .setDescription('Amount of tokens to give')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('take')
                .setDescription('Take Slime Tokens from a user (Lead only)')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User to take tokens from')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('amount')
                        .setDescription('Amount of tokens to take')
                        .setRequired(true))),

    async execute(interaction, { database }) {
        // Silently ignore if not in Gate Guild
        if (interaction.guild.id !== GATE_GUILD) {
            return;
        }

        const { mGateDB, mGateServerDB } = database;
        const subcommand = interaction.options.getSubcommand();
        const config = require('../config.json');

        // Get server settings
        let serverData = await mGateServerDB.findOne({ serverID: GATE_GUILD });
        if (!serverData) {
            await mGateServerDB.insertOne({
                serverID: GATE_GUILD,
                economyEnabled: false,
                cardTrackingEnabled: true, // Default to true for backward compatibility
                totalTokens: 0,
                mods: [],
                giveaway: []
            });
            serverData = await mGateServerDB.findOne({ serverID: GATE_GUILD });
        }

        // Handle nuke command
        if (subcommand === 'nuke') {
            // Check if user has nuke permission
            if (!config.nuke.includes(interaction.user.id)) {
                return;
            }

            const confirmButton = new ButtonBuilder()
                .setCustomId('nuke_confirm_1')
                .setLabel('Confirm Nuke (1/2)')
                .setStyle(ButtonStyle.Danger);

            const cancelButton = new ButtonBuilder()
                .setCustomId('nuke_cancel')
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Secondary);

            const row = new ActionRowBuilder()
                .addComponents(confirmButton, cancelButton);

            const response = await interaction.reply({
                content: '⚠️ **WARNING**: This will delete ALL economy data. Are you sure?',
                components: [row],
                ephemeral: true
            });

            // Create collector for buttons
            const collector = response.createMessageComponentCollector({
                filter: i => i.user.id === interaction.user.id,
                time: 30000 // 30 seconds
            });

            collector.on('collect', async i => {
                if (i.customId === 'nuke_cancel') {
                    await i.update({
                        content: '❌ Nuke cancelled.',
                        components: []
                    });
                    collector.stop();
                }
                else if (i.customId === 'nuke_confirm_1') {
                    const finalConfirmButton = new ButtonBuilder()
                        .setCustomId('nuke_confirm_final')
                        .setLabel('CONFIRM NUKE (FINAL)')
                        .setStyle(ButtonStyle.Danger);

                    const finalCancelButton = new ButtonBuilder()
                        .setCustomId('nuke_cancel')
                        .setLabel('Cancel')
                        .setStyle(ButtonStyle.Secondary);

                    const finalRow = new ActionRowBuilder()
                        .addComponents(finalConfirmButton, finalCancelButton);

                    await i.update({
                        content: '⚠️ **FINAL WARNING**: This action cannot be undone. Are you absolutely sure?',
                        components: [finalRow]
                    });
                }
                else if (i.customId === 'nuke_confirm_final') {
                    await i.update({
                        content: '🔄 Nuking economy data...',
                        components: []
                    });

                    try {
                        // Reset all users' currency and tickets
                        await mGateDB.updateMany(
                            {},
                            { 
                                $set: { 
                                    'currency': [0, 0, 0, 0, 0, 0] // Added 6th slot for tickets
                                }
                            }
                        );

                        // Reset server data
                        await mGateServerDB.updateOne(
                            { serverID: GATE_GUILD },
                            {
                                $set: {
                                    totalTokens: 0,
                                    giveaway: []
                                }
                            }
                        );

                        await i.editReply({
                            content: '💥 Economy data has been nuked successfully.',
                            components: []
                        });
                    } catch (error) {
                        console.error('Error nuking economy data:', error);
                        await i.editReply({
                            content: '❌ An error occurred while nuking the economy data.',
                            components: []
                        });
                    }
                }
            });

            collector.on('end', collected => {
                if (collected.size === 0) {
                    interaction.editReply({
                        content: '❌ Nuke cancelled - timed out.',
                        components: []
                    });
                }
            });

            return;
        }

        // Handle help command
        if (subcommand === 'help') {
            const isLead = config.leads.includes(interaction.user.id);
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('<:Slime_Token:1304929154285703179> Gate System')
                .setDescription(
                    `Gate system is currently **${serverData.economyEnabled ? 'enabled' : 'disabled'}**\n` +
                    `Card tracking is currently **${serverData.cardTrackingEnabled !== false ? 'enabled' : 'disabled'}**`
                );

            if (isLead) {
                // Lead help menu (hidden from others)
                embed.addFields(
                    { name: 'Lead Commands', value: 
                        '`/gate toggle` - Enable/disable gate system\n' +
                        '`/gate togglecards` - Enable/disable card tracking\n' +
                        '`/gate give <user> <amount>` - Give Slime Tokens to user\n' +
                        '`/gate take <user> <amount>` - Take Slime Tokens from user\n' +
                        '`/gate balance <user>` - Check user\'s tickets\n' +
                        '**Cooldown**: 5 seconds', inline: false },
                );
            }

            // Regular commands (visible to all)
            embed.addFields(
                { name: 'User Commands', value: 
                    '`/gate balance` - Check your tickets and tokens\n' +
                    '`/gate buy` - Buy a ticket with Slime Tokens\n' +
                    '`/gate gift <user>` - Gift special ticket (10000 tokens)\n' +
                    '`/gate giveaway` - View giveaway rewards\n' +
                    '**Cooldown**: 10 seconds', inline: false },
                { name: 'Ticket Information', value:
                    '• Earn 0-10 Slime Tokens from claiming cards\n' +
                    '• Maximum balance: 25,000 Slime Tokens\n' +
                    '• First ticket: 500 Slime Tokens\n' +
                    '• Second ticket: 1,000 Slime Tokens\n' +
                    '• Third ticket: 2,500 Slime Tokens\n' +
                    '• Fourth ticket: 5,000 Slime Tokens\n' +
                    '• Fifth+ ticket: 10,000 Slime Tokens\n' +
                    '• Special Gift Ticket: 10,000 Slime Tokens', inline: false }
            );

            return interaction.reply({
                embeds: [embed],
                ephemeral: true
            });
        }

        // Handle toggle command
        if (subcommand === 'toggle') {
            if (!config.leads.includes(interaction.user.id)) {
                return;
            }

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

        // Handle togglecards command
        if (subcommand === 'togglecards') {
            if (!config.leads.includes(interaction.user.id)) {
                return;
            }

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

        // Check if economy is enabled for economy-related commands
        if (!serverData.economyEnabled && ['balance', 'buy', 'gift', 'giveaway', 'give', 'take'].includes(subcommand)) {
            return interaction.reply({
                content: '❌ The gate system is currently disabled.',
                ephemeral: true
            });
        }

        // Check cooldown
        const isLead = config.leads.includes(interaction.user.id);
        const cooldownTime = isLead ? LEAD_COOLDOWN : USER_COOLDOWN;
        
        if (cooldowns.has(interaction.user.id)) {
            const expirationTime = cooldowns.get(interaction.user.id);
            const now = Date.now();
            
            if (now < expirationTime) {
                const timeLeft = (expirationTime - now) / 1000;
                return interaction.reply({
                    content: `Please wait ${timeLeft.toFixed(1)} seconds before using this command again.`,
                    ephemeral: true
                });
            }
        }

        // Set cooldown
        cooldowns.set(interaction.user.id, Date.now() + (cooldownTime * 1000));
        setTimeout(() => cooldowns.delete(interaction.user.id), cooldownTime * 1000);

        // Helper function to ensure user exists in database
        async function ensureUser(userId) {
            let userData = await mGateDB.findOne({ userID: userId });
            if (!userData) {
                await mGateDB.insertOne({
                    userID: userId,
                    currency: [0, 0, 0, 0, 0, 0], // Added 6th slot for tickets
                    mission: [],
                    achievements: []
                });
                userData = await mGateDB.findOne({ userID: userId });
            } else if (userData.currency.length === 5) {
                // Update existing users to have the 6th slot
                await mGateDB.updateOne(
                    { userID: userId },
                    { $push: { currency: 0 } }
                );
                userData = await mGateDB.findOne({ userID: userId });
            }
            return userData;
        }

        // Helper function to get next ticket price
        function getNextTicketPrice(currentTickets) {
            const prices = [500, 1000, 2500, 5000, 10000];
            return currentTickets >= prices.length ? 10000 : prices[currentTickets];
        }

        try {
            switch (subcommand) {
                case 'balance': {
                    const targetUser = interaction.options.getUser('user');
                    
                    // If checking another user's balance, verify lead permission
                    if (targetUser && !config.leads.includes(interaction.user.id)) {
                        return interaction.reply({
                            content: '❌ Only leads can check other users\' tickets.',
                            ephemeral: true
                        });
                    }

                    const userToCheck = targetUser || interaction.user;
                    const userData = await ensureUser(userToCheck.id);
                    const slimeTokens = userData.currency[0];
                    const tickets = userData.currency[5] || 0;
                    const nextPrice = getNextTicketPrice(tickets);
                    
                    return interaction.reply({
                        content: `${userToCheck.username}'s balance:\n:tickets: x${tickets} Ticket\n<:Slime_Token:1304929154285703179> ${slimeTokens} Slime Token\nNext ticket price: ${nextPrice} Slime Tokens`,
                        ephemeral: true
                    });
                }

                case 'buy': {
                    const userData = await ensureUser(interaction.user.id);
                    const currentSlimeTokens = userData.currency[0];
                    const currentTickets = userData.currency[5] || 0;
                    const ticketCost = getNextTicketPrice(currentTickets);

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

                    // Create collector for buttons
                    const collector = response.createMessageComponentCollector({
                        filter: i => i.user.id === interaction.user.id,
                        time: 30000 // 30 seconds
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
                            // Verify tokens again in case they were spent elsewhere
                            const updatedUserData = await mGateDB.findOne({ userID: interaction.user.id });
                            if (updatedUserData.currency[0] < ticketCost) {
                                await i.update({
                                    content: `❌ You don't have enough Slime Tokens! You need ${ticketCost} Slime Tokens but only have ${updatedUserData.currency[0]}.`,
                                    components: []
                                });
                                return;
                            }

                            // Update user's tokens and tickets
                            await mGateDB.updateOne(
                                { userID: interaction.user.id },
                                {
                                    $inc: { 
                                        'currency.0': -ticketCost,
                                        'currency.5': 1
                                    }
                                }
                            );

                            const nextPrice = getNextTicketPrice(currentTickets + 1);
                            await i.update({
                                content: `✅ Successfully purchased a ticket! Your new balance is ${updatedUserData.currency[0] - ticketCost} Slime Tokens.\nNext ticket will cost: ${nextPrice} Slime Tokens`,
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

                case 'gift': {
                    const userData = await ensureUser(interaction.user.id);
                    const targetUser = interaction.options.getUser('user');
                    const cost = 10000;

                    if (userData.currency[0] < cost) {
                        return interaction.reply({
                            content: `❌ You need ${cost} Slime Tokens to gift a special ticket! You only have ${userData.currency[0]} Slime Tokens.`,
                            ephemeral: true
                        });
                    }

                    // Update gifter's tokens
                    await mGateDB.updateOne(
                        { userID: interaction.user.id },
                        { $inc: { 'currency.0': -cost } }
                    );

                    // Add ticket to recipient
                    await ensureUser(targetUser.id);
                    await mGateDB.updateOne(
                        { userID: targetUser.id },
                        { $inc: { 'currency.5': 1 } }
                    );

                    return interaction.reply({
                        content: `✅ Successfully gifted a Special Ticket to ${targetUser.username}! Your new balance is ${userData.currency[0] - cost} Slime Tokens.`,
                        ephemeral: true
                    });
                }

                case 'giveaway': {
                    return interaction.reply({
                        content: `🎉 Current Giveaway Rewards:\n\n` +
                            `:tickets: First Ticket (500 Slime Tokens): Basic reward chance\n` +
                            `:tickets: Second Ticket (1000 Slime Tokens): Improved reward chance\n` +
                            `:tickets: Third Ticket (2500 Slime Tokens): High reward chance\n` +
                            `:tickets: Fourth Ticket (5000 Slime Tokens): Premium reward chance\n` +
                            `:tickets: Fifth+ Ticket (10000 Slime Tokens): Ultimate reward chance\n` +
                            `:tickets: Gift Ticket: Exclusive reward chance`,
                        ephemeral: true
                    });
                }

                case 'give': {
                    // Check if user is a lead
                    if (!config.leads.includes(interaction.user.id)) {
                        return;
                    }

                    const targetUser = interaction.options.getUser('user');
                    const amount = interaction.options.getInteger('amount');

                    if (amount <= 0) {
                        return;
                    }

                    await ensureUser(targetUser.id);
                    const userData = await mGateDB.findOne({ userID: targetUser.id });
                    const newBalance = userData.currency[0] + amount;

                    if (newBalance > 25000) {
                        return interaction.reply({
                            content: `❌ This would exceed the maximum balance of 25000 Slime Tokens! Current balance: ${userData.currency[0]}`,
                            ephemeral: true
                        });
                    }

                    await mGateDB.updateOne(
                        { userID: targetUser.id },
                        { $inc: { 'currency.0': amount } }
                    );

                    return interaction.reply({
                        content: `✅ Successfully gave ${amount} Slime Tokens to ${targetUser.username}. Their new balance is ${newBalance} Slime Tokens.`,
                        ephemeral: true
                    });
                }

                case 'take': {
                    // Check if user is a lead
                    if (!config.leads.includes(interaction.user.id)) {
                        return;
                    }

                    const targetUser = interaction.options.getUser('user');
                    const amount = interaction.options.getInteger('amount');

                    if (amount <= 0) {
                        return;
                    }

                    await ensureUser(targetUser.id);
                    const userData = await mGateDB.findOne({ userID: targetUser.id });
                    const newBalance = userData.currency[0] - amount;

                    if (newBalance < 0) {
                        return interaction.reply({
                            content: `❌ This would put the user's balance below 0! Current balance: ${userData.currency[0]}`,
                            ephemeral: true
                        });
                    }

                    await mGateDB.updateOne(
                        { userID: targetUser.id },
                        { $inc: { 'currency.0': -amount } }
                    );

                    return interaction.reply({
                        content: `✅ Successfully took ${amount} Slime Tokens from ${targetUser.username}. Their new balance is ${newBalance} Slime Tokens.`,
                        ephemeral: true
                    });
                }
            }
        } catch (error) {
            console.error('Error in gate command:', error);
            return interaction.reply({
                content: '❌ An error occurred while processing your request.',
                ephemeral: true
            });
        }
    },
}
