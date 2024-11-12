const { SlashCommandBuilder, EmbedBuilder, Collection, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { PermissionsBitField } = require('discord.js');
const axios = require('axios');

const GATE_GUILD = '1240866080985976844';
const SR_PING_ROLE = '1305567492277796908';

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
                .setName('nuke')
                .setDescription('null')) // Invisible description using special character
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
                        .setDescription('User to check balance for (Lead only)')))
        .addSubcommand(subcommand =>
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
                        )))
        .addSubcommand(subcommand =>
            subcommand
                .setName('gift')
                .setDescription('Gift a special ticket to another user (costs 500 tokens)')
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
                .setDescription('Give currency to a user (Lead only)')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User to give currency to')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('Type of currency')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Slime Tokens', value: 'tokens' },
                            { name: 'Tickets', value: 'tickets' }
                        ))
                .addIntegerOption(option =>
                    option.setName('amount')
                        .setDescription('Amount to give')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('take')
                .setDescription('Take currency from a user (Lead only)')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User to take currency from')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('Type of currency')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Slime Tokens', value: 'tokens' },
                            { name: 'Tickets', value: 'tickets' }
                        ))
                .addIntegerOption(option =>
                    option.setName('amount')
                        .setDescription('Amount to take')
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
                    achievements: [],
                    premium: {
                        active: false,
                        expiresAt: null
                    }
                });
                userData = await mGateDB.findOne({ userID: userId });
            } else if (!userData.premium) {
                // Update existing users to have premium field
                await mGateDB.updateOne(
                    { userID: userId },
                    { 
                        $set: { 
                            premium: {
                                active: false,
                                expiresAt: null
                            }
                        }
                    }
                );
                userData = await mGateDB.findOne({ userID: userId });
            }
            return userData;
        }

        try {
            switch (subcommand) {
                case 'nuke': {
                    if (!config.leads.includes(interaction.user.id)) {
                        return;
                    }

                    // Reset all users' currency and premium status
                    await mGateDB.updateMany(
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
                    await mGateServerDB.updateOne(
                        { serverID: GATE_GUILD },
                        {
                            $set: {
                                totalTokens: 0,
                                giveaway: []
                            }
                        }
                    );

                    return interaction.reply({
                        content: '✅ Economy has been reset. All currency and premium status have been cleared.',
                        ephemeral: true
                    });
                }

                case 'help': {
                    const isLead = config.leads.includes(interaction.user.id);
                    const embed = new EmbedBuilder()
                        .setColor('#0099ff')
                        .setTitle('<:Slime_Token:1304929154285703179> Gate System')
                        .setDescription(
                            `Gate system is currently **${serverData.economyEnabled ? 'enabled' : 'disabled'}**\n` +
                            `Card tracking is currently **${serverData.cardTrackingEnabled !== false ? 'enabled' : 'disabled'}**`
                        );

                    if (isLead) {
                        embed.addFields(
                            { name: 'Lead Commands', value: 
                                '`/gate toggle` - Enable/disable gate system\n' +
                                '`/gate togglecards` - Enable/disable card tracking\n' +
                                '`/gate give <user> <type> <amount>` - Give tokens/tickets to user\n' +
                                '`/gate take <user> <type> <amount>` - Take tokens/tickets from user\n' +
                                '`/gate balance <user>` - Check user\'s balance\n' +
                                '**Cooldown**: 5 seconds', inline: false },
                        );
                    }

                    embed.addFields(
                        { name: 'User Commands', value: 
                            '`/gate balance` - Check your balance\n' +
                            '`/gate buy ticket` - Buy a ticket (500 tokens)\n' +
                            '`/gate buy premium` - Buy premium (1000 tokens, 1 day)\n' +
                            '`/gate gift <user>` - Gift special ticket (500 tokens)\n' +
                            '`/gate giveaway` - View giveaway rewards\n' +
                            '**Cooldown**: 10 seconds', inline: false },
                        { name: 'Information', value:
                            '• Earn 0-10 Slime Tokens from claiming cards\n' +
                            '• Maximum balance: 25,000 Slime Tokens\n' +
                            '• Regular ticket: 500 Slime Tokens\n' +
                            '• Special Gift Ticket: 500 Slime Tokens\n' +
                            '• Premium (1 day): 1000 Slime Tokens\n' +
                            '• Premium benefits: SR-ping role', inline: false }
                    );

                    return interaction.reply({
                        embeds: [embed],
                        ephemeral: true
                    });
                }

                case 'toggle': {
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

                case 'togglecards': {
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

                case 'balance': {
                    const targetUser = interaction.options.getUser('user');
                    
                    if (targetUser && !config.leads.includes(interaction.user.id)) {
                        return interaction.reply({
                            content: '❌ Only leads can check other users\' balance.',
                            ephemeral: true
                        });
                    }

                    const userToCheck = targetUser || interaction.user;
                    const userData = await ensureUser(userToCheck.id);
                    const slimeTokens = userData.currency[0];
                    const tickets = userData.currency[5] || 0;
                    
                    let premiumStatus = '';
                    if (userData.premium?.active) {
                        const expiresAt = new Date(userData.premium.expiresAt);
                        const now = new Date();
                        if (expiresAt > now) {
                            const timeLeft = Math.ceil((expiresAt - now) / (1000 * 60 * 60));
                            premiumStatus = `\n👑 Premium active (${timeLeft} hours remaining)`;
                        } else {
                            await mGateDB.updateOne(
                                { userID: userToCheck.id },
                                { 
                                    $set: { 
                                        'premium.active': false,
                                        'premium.expiresAt': null
                                    }
                                }
                            );
                            const member = await interaction.guild.members.fetch(userToCheck.id);
                            if (member.roles.cache.has(SR_PING_ROLE)) {
                                await member.roles.remove(SR_PING_ROLE);
                            }
                        }
                    }
                    
                    return interaction.reply({
                        content: `${userToCheck.username}'s balance:\n:tickets: x${tickets} Ticket\n<:Slime_Token:1304929154285703179> ${slimeTokens} Slime Token${premiumStatus}`,
                        ephemeral: true
                    });
                }

                case 'buy': {
                    const type = interaction.options.getString('type');
                    const userData = await ensureUser(interaction.user.id);
                    const currentSlimeTokens = userData.currency[0];

                    if (type === 'premium') {
                        const premiumCost = 1000;
                        
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
                                const updatedUserData = await mGateDB.findOne({ userID: interaction.user.id });
                                if (updatedUserData.currency[0] < premiumCost) {
                                    await i.update({
                                        content: `❌ You don't have enough Slime Tokens! You need ${premiumCost} Slime Tokens but only have ${updatedUserData.currency[0]}.`,
                                        components: []
                                    });
                                    return;
                                }

                                const expiresAt = new Date();
                                expiresAt.setDate(expiresAt.getDate() + 1);

                                await mGateDB.updateOne(
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
                                    content: `✅ Successfully purchased premium! Your new balance is ${updatedUserData.currency[0] - premiumCost} Slime Tokens.\nPremium will expire in 24 hours.`,
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
                        const ticketCost = 500;

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
                                const updatedUserData = await mGateDB.findOne({ userID: interaction.user.id });
                                if (updatedUserData.currency[0] < ticketCost) {
                                    await i.update({
                                        content: `❌ You don't have enough Slime Tokens! You need ${ticketCost} Slime Tokens but only have ${updatedUserData.currency[0]}.`,
                                        components: []
                                    });
                                    return;
                                }

                                await mGateDB.updateOne(
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

                case 'gift': {
                    const userData = await ensureUser(interaction.user.id);
                    const targetUser = interaction.options.getUser('user');
                    const cost = 500;

                    if (userData.currency[0] < cost) {
                        return interaction.reply({
                            content: `❌ You need ${cost} Slime Tokens to gift a special ticket! You only have ${userData.currency[0]} Slime Tokens.`,
                            ephemeral: true
                        });
                    }

                    await mGateDB.updateOne(
                        { userID: interaction.user.id },
                        { $inc: { 'currency.0': -cost } }
                    );

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
                    // Check for active giveaways
                    if (!serverData.giveaway || serverData.giveaway.length === 0) {
                        return interaction.reply({
                            content: '❌ There are no active giveaways at the moment.',
                            ephemeral: true
                        });
                    }

                    // Get the current giveaway
                    const currentGiveaway = serverData.giveaway[0];
                    
                    try {
                        // Fetch card details from API using axios
                        const response = await axios.get(`https://api.mazoku.cc/api/get-inventory-item-by-id/${currentGiveaway.itemId}`);
                        const cardData = response.data;

                        // Create embed
                        const embed = new EmbedBuilder()
                            .setColor('#0099ff')
                            .setTitle('🎉 Current Giveaway')
                            .setDescription(`**${cardData.card.name}**\nFrom: ${cardData.card.series}\nTier: ${cardData.card.tier}`)
                            .setImage(cardData.card.cardImageLink);

                        // Calculate time left
                        const endTime = new Date(currentGiveaway.endTime);
                        const now = new Date();
                        const timeLeft = Math.max(0, Math.floor((endTime - now) / 1000)); // in seconds
                        
                        const hours = Math.floor(timeLeft / 3600);
                        const minutes = Math.floor((timeLeft % 3600) / 60);
                        const seconds = timeLeft % 60;
                        
                        const timeString = `${hours}h ${minutes}m ${seconds}s`;

                        // Add giveaway details
                        let requirementText = 'No requirements';
                        if (currentGiveaway.level > 0 || currentGiveaway.amount > 0) {
                            if (currentGiveaway.level > 0) {
                                requirementText = `Level ${currentGiveaway.level} required`;
                            }
                            if (currentGiveaway.amount > 0) {
                                requirementText += `${currentGiveaway.level > 0 ? ' and ' : ''}${currentGiveaway.amount} tickets required`;
                            }
                        }

                        embed.addFields(
                            { name: 'Time Left', value: timeString, inline: true },
                            { name: 'Entries', value: `${currentGiveaway.entries || 0}`, inline: true },
                            { name: 'Requirements', value: requirementText, inline: false }
                        );

                        return interaction.reply({
                            embeds: [embed],
                            ephemeral: true
                        });
                    } catch (error) {
                        console.error('Error fetching card data:', error);
                        return interaction.reply({
                            content: '❌ Error fetching giveaway details.',
                            ephemeral: true
                        });
                    }
                }

                case 'give': {
                    if (!config.leads.includes(interaction.user.id)) {
                        return;
                    }

                    const targetUser = interaction.options.getUser('user');
                    const type = interaction.options.getString('type');
                    const amount = interaction.options.getInteger('amount');

                    if (amount <= 0) {
                        return;
                    }

                    await ensureUser(targetUser.id);
                    const userData = await mGateDB.findOne({ userID: targetUser.id });

                    if (type === 'tokens') {
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
                    } else if (type === 'tickets') {
                        await mGateDB.updateOne(
                            { userID: targetUser.id },
                            { $inc: { 'currency.5': amount } }
                        );

                        const newTickets = (userData.currency[5] || 0) + amount;
                        return interaction.reply({
                            content: `✅ Successfully gave ${amount} Tickets to ${targetUser.username}. They now have ${newTickets} Tickets.`,
                            ephemeral: true
                        });
                    }
                }

                case 'take': {
                    if (!config.leads.includes(interaction.user.id)) {
                        return;
                    }

                    const targetUser = interaction.options.getUser('user');
                    const type = interaction.options.getString('type');
                    const amount = interaction.options.getInteger('amount');

                    if (amount <= 0) {
                        return;
                    }

                    await ensureUser(targetUser.id);
                    const userData = await mGateDB.findOne({ userID: targetUser.id });

                    if (type === 'tokens') {
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
                    } else if (type === 'tickets') {
                        const currentTickets = userData.currency[5] || 0;
                        if (currentTickets < amount) {
                            return interaction.reply({
                                content: `❌ User doesn't have enough tickets! They only have ${currentTickets} Tickets.`,
                                ephemeral: true
                            });
                        }

                        await mGateDB.updateOne(
                            { userID: targetUser.id },
                            { $inc: { 'currency.5': -amount } }
                        );

                        return interaction.reply({
                            content: `✅ Successfully took ${amount} Tickets from ${targetUser.username}. They now have ${currentTickets - amount} Tickets.`,
                            ephemeral: true
                        });
                    }
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
};
