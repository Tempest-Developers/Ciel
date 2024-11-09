const { SlashCommandBuilder, EmbedBuilder, Collection, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { PermissionsBitField } = require('discord.js');

const GATE_GUILD = '1240866080985976844';

// Cooldowns
const cooldowns = new Collection();
const LEAD_COOLDOWN = 5; // 5 seconds for leads
const USER_COOLDOWN = 10; // 10 seconds for regular users

// Nuke confirmation tracking
const nukeConfirmations = new Collection();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('economy')
        .setDescription('Economy system commands')
        .addSubcommand(subcommand =>
            subcommand
                .setName('nuke')
                .setDescription('Clear all economy data (Restricted)'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('help')
                .setDescription('Show economy system commands and information'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('toggle')
                .setDescription('Toggle the economy system on/off (Lead only)'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('balance')
                .setDescription('Check your balance and tickets'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('buy')
                .setDescription('Buy tickets with tokens')
                .addStringOption(option =>
                    option.setName('ticket')
                        .setDescription('Ticket type to buy')
                        .setRequired(true)
                        .addChoices(
                            { name: '500 Token Ticket', value: '500' },
                            { name: '1000 Token Ticket', value: '1000' },
                            { name: '2500 Token Ticket', value: '2500' },
                            { name: '5000 Token Ticket', value: '5000' },
                            { name: '10000 Token Ticket', value: '10000' },
                        )))
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
                .setDescription('Give tokens to a user (Lead only)')
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
                .setDescription('Take tokens from a user (Lead only)')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User to take tokens from')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('amount')
                        .setDescription('Amount of tokens to take')
                        .setRequired(true))),

    async execute(interaction) {
        // Silently ignore if not in Gate Guild
        if (interaction.guild.id !== GATE_GUILD) {
            return;
        }

        const { mGateDB, mGateServerDB } = interaction.client.database;
        const subcommand = interaction.options.getSubcommand();
        const config = require('../config.json');

        // Get server settings
        let serverData = await mGateServerDB.findOne({ serverID: GATE_GUILD });
        if (!serverData) {
            await mGateServerDB.insertOne({
                serverID: GATE_GUILD,
                economyEnabled: false,
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
                                    'currency.0': 0,
                                    'tickets': []
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
                .setTitle('🪙 Gate Economy System')
                .setDescription(serverData.economyEnabled ? 'Economy system is currently **enabled**' : 'Economy system is currently **disabled**');

            if (isLead) {
                // Lead help menu (hidden from others)
                embed.addFields(
                    { name: 'Lead Commands', value: 
                        '`/economy toggle` - Enable/disable economy system\n' +
                        '`/economy give <user> <amount>` - Give tokens to user\n' +
                        '`/economy take <user> <amount>` - Take tokens from user\n' +
                        '**Cooldown**: 5 seconds', inline: false },
                );
            }

            // Regular commands (visible to all)
            embed.addFields(
                { name: 'User Commands', value: 
                    '`/economy balance` - Check your tokens and tickets\n' +
                    '`/economy buy <ticket>` - Buy tickets with tokens\n' +
                    '`/economy gift <user>` - Gift special ticket (10000 tokens)\n' +
                    '`/economy giveaway` - View giveaway rewards\n' +
                    '**Cooldown**: 10 seconds', inline: false },
                { name: 'Token Information', value:
                    '• Earn 0-10 tokens from claiming cards\n' +
                    '• Maximum balance: 25,000 tokens\n' +
                    '• Tickets: 500, 1000, 2500, 5000, 10000\n' +
                    '• Special Gift Ticket: 10,000 tokens', inline: false }
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
                content: `✅ Economy system has been ${newState ? 'enabled' : 'disabled'}.`,
                ephemeral: true
            });
        }

        // Check if economy is enabled for all other commands
        if (!serverData.economyEnabled) {
            return;
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
                    currency: [0, 0, 0, 0, 0],
                    tickets: [],
                    mission: [],
                    achievements: []
                });
                userData = await mGateDB.findOne({ userID: userId });
            }
            return userData;
        }

        try {
            switch (subcommand) {
                case 'balance': {
                    const userData = await ensureUser(interaction.user.id);
                    const tokens = userData.currency[0];
                    const tickets = userData.tickets || [];
                    
                    return interaction.reply({
                        content: `Your balance:\n🪙 ${tokens} Slime Tokens\n🎟️ Tickets: ${tickets.length > 0 ? tickets.join(', ') : 'None'}`,
                        ephemeral: true
                    });
                }

                case 'buy': {
                    const ticketCost = parseInt(interaction.options.getString('ticket'));
                    const userData = await ensureUser(interaction.user.id);
                    const currentTokens = userData.currency[0];

                    if (currentTokens < ticketCost) {
                        return interaction.reply({
                            content: `❌ You don't have enough tokens! You need ${ticketCost} tokens but only have ${currentTokens}.`,
                            ephemeral: true
                        });
                    }

                    if (currentTokens - ticketCost < 0) {
                        return interaction.reply({
                            content: `❌ This would put your balance below 0!`,
                            ephemeral: true
                        });
                    }

                    // Update user's tokens and add ticket
                    await mGateDB.updateOne(
                        { userID: interaction.user.id },
                        {
                            $inc: { 'currency.0': -ticketCost },
                            $push: { tickets: `${ticketCost} Ticket` }
                        }
                    );

                    return interaction.reply({
                        content: `✅ Successfully purchased a ${ticketCost} Token Ticket! Your new balance is ${currentTokens - ticketCost} tokens.`,
                        ephemeral: true
                    });
                }

                case 'gift': {
                    const userData = await ensureUser(interaction.user.id);
                    const targetUser = interaction.options.getUser('user');
                    const cost = 10000;

                    if (userData.currency[0] < cost) {
                        return interaction.reply({
                            content: `❌ You need ${cost} tokens to gift a special ticket! You only have ${userData.currency[0]} tokens.`,
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
                        { $push: { tickets: 'Special Gift Ticket' } }
                    );

                    return interaction.reply({
                        content: `✅ Successfully gifted a Special Ticket to ${targetUser.username}! Your new balance is ${userData.currency[0] - cost} tokens.`,
                        ephemeral: false
                    });
                }

                case 'giveaway': {
                    return interaction.reply({
                        content: `🎉 Current Giveaway Rewards:\n\n` +
                            `🎟️ 500 Token Ticket: Basic reward chance\n` +
                            `🎟️ 1000 Token Ticket: Improved reward chance\n` +
                            `🎟️ 2500 Token Ticket: High reward chance\n` +
                            `🎟️ 5000 Token Ticket: Premium reward chance\n` +
                            `🎟️ 10000 Token Ticket: Ultimate reward chance\n` +
                            `🎟️ Special Gift Ticket: Exclusive reward chance`,
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
                            content: `❌ This would exceed the maximum balance of 25000 tokens! Current balance: ${userData.currency[0]}`,
                            ephemeral: true
                        });
                    }

                    await mGateDB.updateOne(
                        { userID: targetUser.id },
                        { $inc: { 'currency.0': amount } }
                    );

                    return interaction.reply({
                        content: `✅ Successfully gave ${amount} tokens to ${targetUser.username}. Their new balance is ${newBalance} tokens.`,
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
                        content: `✅ Successfully took ${amount} tokens from ${targetUser.username}. Their new balance is ${newBalance} tokens.`,
                        ephemeral: true
                    });
                }
            }
        } catch (error) {
            console.error('Error in economy command:', error);
        }
    },
};
