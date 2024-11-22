const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const getTierEmoji = require('../utility/getTierEmoji');
const { handleInteraction, handleCommandError, safeDefer } = require('../utility/interactionHandler');
require('dotenv').config();

const MIMS_GUILD = process.env.MIMS_GUILD;
const GUILD_CHANNELS = {
    '1240866080985976844': '1307335913462038639' // Map of guild ID to channel ID
};

// Helper function to parse duration string to milliseconds
function parseDuration(duration) {
    const match = duration.match(/^(\d+)([dhms])$/);
    if (!match) {
        throw new Error('Invalid duration format. Use format like 1d, 10h, 30m, or 45s');
    }

    const [, amount, unit] = match;
    const value = parseInt(amount);

    switch (unit) {
        case 'd': return value * 24 * 60 * 60 * 1000; // days to ms
        case 'h': return value * 60 * 60 * 1000;      // hours to ms
        case 'm': return value * 60 * 1000;           // minutes to ms
        case 's': return value * 1000;                // seconds to ms
        default: throw new Error('Invalid time unit');
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('Giveaway system commands')
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Create a new giveaway')
                .addIntegerOption(option =>
                    option.setName('level')
                        .setDescription('Giveaway level')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Level 0 (Single Card)', value: 0 },
                            { name: 'Level 1 (Custom Item)', value: 1 },
                            { name: 'Level 2 (Multiple Winners)', value: 2 }
                        ))
                .addStringOption(option =>
                    option.setName('prize')
                        .setDescription('Prize(s) for the giveaway. For Level 2, separate multiple prizes with commas.')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('message')
                        .setDescription('Description/message for the giveaway')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('amount')
                        .setDescription('Number of tickets or winners')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('duration')
                        .setDescription('Duration of giveaway (e.g., 1d, 12h, 30m, 45s)')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('image-url')
                        .setDescription('Image URL (only for Level 1)')
                        .setRequired(false))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all giveaways')
                .addBooleanOption(option =>
                    option.setName('active')
                        .setDescription('Filter by active status'))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('check')
                .setDescription('Check a specific giveaway')
                .addIntegerOption(option =>
                    option.setName('giveaway-id')
                        .setDescription('The ID of the giveaway')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('new-timestamp')
                        .setDescription('New timestamp for the giveaway (optional)'))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('announce')
                .setDescription('Announce a giveaway')
                .addIntegerOption(option =>
                    option.setName('giveaway-id')
                        .setDescription('The ID of the giveaway to announce')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('guild-id')
                        .setDescription('Guild ID to announce in')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('channel-id')
                        .setDescription('Channel ID to announce in')
                        .setRequired(true))
        ),

    async execute(interaction, { database }) {
        try {
            // Only work in MIMS_GUILD
            if (interaction.guild.id !== MIMS_GUILD) {
                return await handleInteraction(interaction, {
                    content: '❌ This command can only be used in MIMS Guild.',
                    ephemeral: true
                }, 'reply');
            }

            await safeDefer(interaction);

            const { mGiveawayDB } = database;
            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
                case 'set': {
                    const level = interaction.options.getInteger('level');
                    const prize = interaction.options.getString('prize');
                    const message = interaction.options.getString('message');
                    const imageUrl = interaction.options.getString('image-url');
                    const amount = interaction.options.getInteger('amount');
                    const duration = interaction.options.getString('duration');

                    // Validate required fields
                    if (!prize.trim() || !message.trim()) {
                        return await handleInteraction(interaction, {
                            content: '❌ Prize and Message cannot be empty.',
                            ephemeral: true
                        }, 'editReply');
                    }

                    // Validate amount
                    if (amount <= 0) {
                        return await handleInteraction(interaction, {
                            content: '❌ Amount must be greater than 0.',
                            ephemeral: true
                        }, 'editReply');
                    }

                    // Parse duration
                    let durationMs;
                    try {
                        durationMs = parseDuration(duration);
                    } catch (error) {
                        return await handleInteraction(interaction, {
                            content: `❌ ${error.message}`,
                            ephemeral: true
                        }, 'editReply');
                    }

                    // Calculate end timestamp
                    const endTimestamp = Math.floor((new Date(Date.now() + durationMs)).getTime() / 1000);

                    // Process based on level
                    let itemDetails = {};
                    switch (level) {
                        case 0: {
                            // Level 0: Item ID, retrieve from API
                            try {
                                const { data: itemData } = await axios.get(`https://api.mazoku.cc/api/get-inventory-item-by-id/${prize}`);
                                
                                // Format item description
                                const itemDescription = message || `${getTierEmoji(itemData.card.tier+"T")} ${itemData.card.name} #${itemData.version}\n${itemData.card.series}`;
                                
                                itemDetails = {
                                    name: itemData.card.name,
                                    description: itemDescription,
                                    imageUrl: itemData.card.cardImageLink.replace('.png', '')
                                };
                            } catch (error) {
                                return await handleInteraction(interaction, {
                                    content: '❌ Invalid item ID.',
                                    ephemeral: true
                                }, 'editReply');
                            }
                            break;
                        }
                        case 1: {
                            // Level 1: Custom item with prize and message
                            itemDetails = {
                                name: prize,
                                description: message,
                                imageUrl: imageUrl || null
                            };
                            break;
                        }
                        case 2: {
                            // Level 2: Multiple prizes
                            const prizes = prize.split(',').map(p => p.trim());
                            
                            if (prizes.length < amount) {
                                return await handleInteraction(interaction, {
                                    content: `❌ Not enough prizes. You specified ${amount} winners but only ${prizes.length} prizes.`,
                                    ephemeral: true
                                }, 'editReply');
                            }

                            itemDetails = {
                                name: prizes.join(','),
                                description: message,
                                imageUrl: null
                            };
                            break;
                        }
                    }

                    try {
                        // Create giveaway
                        const giveaway = await database.createGiveaway(
                            interaction.user.id,
                            itemDetails,
                            level,
                            amount,
                            endTimestamp
                        );

                        return await handleInteraction(interaction, { 
                            content: `✅ Giveaway created successfully!\n` +
                                     `Prize: ${itemDetails.name}\n` +
                                     `Level: ${level}\n` +
                                     `Ends: <t:${endTimestamp}:R>`,
                            ephemeral: true 
                        }, 'editReply');
                    } catch (error) {
                        throw new Error('Error creating giveaway.');
                    }
                }

                case 'list': {
                    const activeFilter = interaction.options.getBoolean('active');
                    const giveaways = await database.getGiveaways(activeFilter);

                    if (giveaways.length === 0) {
                        return await handleInteraction(interaction, {
                            content: '❌ No giveaways found.',
                            ephemeral: true
                        }, 'editReply');
                    }

                    const embed = new EmbedBuilder()
                        .setColor('#0099ff')
                        .setTitle('🎉 Giveaway List')
                        .setDescription(`Showing ${activeFilter !== null ? (activeFilter ? 'active' : 'inactive') : 'all'} giveaways`);

                    for (const giveaway of giveaways) {
                        let prizeDisplay = giveaway.item?.name || 'No Prize Set';
                        if (giveaway.level === 2) {
                            const prizes = prizeDisplay.split(',').map((p, i) => `${i + 1}. ${p.trim()}`).join('\n');
                            prizeDisplay = `Prizes:\n${prizes}`;
                        }

                        embed.addFields({
                            name: `Giveaway #${giveaway.giveawayID}`,
                            value: `${prizeDisplay}\n` +
                                   `Message: ${giveaway.item?.description || 'No Message Set'}\n` +
                                   `Level: ${giveaway.level}\n` +
                                   `Tickets/Winners: ${giveaway.amount}\n` +
                                   `Status: ${giveaway.active ? '🟢 Active' : '🔴 Inactive'}\n` +
                                   `Ends: <t:${giveaway.endTimestamp}:R>`
                        });
                    }

                    return await handleInteraction(interaction, { embeds: [embed] }, 'editReply');
                }

                case 'check': {
                    const giveawayId = interaction.options.getInteger('giveaway-id');
                    const newTimestamp = interaction.options.getString('new-timestamp');

                    const giveaway = await database.getGiveaway(giveawayId);
                    if (!giveaway) {
                        return await handleInteraction(interaction, {
                            content: '❌ Giveaway not found.',
                            ephemeral: true
                        }, 'editReply');
                    }

                    if (newTimestamp) {
                        await database.updateGiveawayTimestamp(giveawayId, new Date(newTimestamp));
                    }

                    let description = '';
                    if (giveaway.level === 2) {
                        const prizes = giveaway.item?.name?.split(',').map((p, i) => `${i + 1}. ${p.trim()}`).join('\n') || 'No Prizes Set';
                        description = `**Prizes:**\n${prizes}\n\n`;
                    } else {
                        description = `**Prize:** ${giveaway.item?.name || 'No Prize Set'}\n`;
                    }
                    description += `**Message:** ${giveaway.item?.description || 'No Message Set'}\n` +
                                 `**Status:** ${giveaway.active ? '🟢 Active' : '🔴 Inactive'}\n` +
                                 `**Level:** ${giveaway.level}\n` +
                                 `**Tickets/Winners:** ${giveaway.amount}\n` +
                                 `**Created By:** <@${giveaway.userID}>\n` +
                                 `**Ends At:** <t:${giveaway.endTimestamp}:R>`;

                    const embed = new EmbedBuilder()
                        .setColor('#0099ff')
                        .setTitle(`Giveaway #${giveaway.giveawayID}`)
                        .setDescription(description)
                        .setImage(giveaway.item?.imageUrl || null);

                    return await handleInteraction(interaction, { embeds: [embed] }, 'editReply');
                }

                case 'announce': {
                    const giveawayId = interaction.options.getInteger('giveaway-id');
                    const guildId = interaction.options.getString('guild-id');
                    const channelId = interaction.options.getString('channel-id');

                    try {
                        const announcementData = await database.announceGiveaway(giveawayId, guildId, channelId);
                        
                        let description = '';
                        if (announcementData.giveaway.level === 2) {
                            const prizes = announcementData.giveaway.item?.name?.split(',').map((p, i) => `${p.trim()}`).join(' ') || 'No Prizes Set';
                            description = `**Prizes:**\n${prizes}\n\n`;
                        } else {
                            description = `**Prize:** ${announcementData.giveaway.item?.name || 'No Prize Set'}\n`;
                        }
                        description += `**Message:** ${announcementData.giveaway.item?.description || 'No Message Set'}\n` +
                                     `**Winners:** ${announcementData.giveaway.amount}\n` +
                                     `**Ends:** <t:${announcementData.giveaway.endTimestamp}:R>`;

                        // Create announcement embed
                        const embed = new EmbedBuilder()
                            .setColor('#0099ff')
                            .setTitle('🎉 New Giveaway!')
                            .setDescription(description)
                            .setImage(announcementData.giveaway.item?.imageUrl || null);

                        // Attempt to send to specified channel
                        const guild = await interaction.client.guilds.fetch(guildId);
                        const channel = await guild.channels.fetch(channelId);
                        await channel.send({ embeds: [embed] });

                        return await handleInteraction(interaction, {
                            content: `✅ Giveaway #${giveawayId} announced in <#${channelId}>`,
                            ephemeral: true
                        }, 'editReply');
                    } catch (error) {
                        throw new Error('Error announcing giveaway. Check guild and channel IDs.');
                    }
                }
            }
        } catch (error) {
            await handleCommandError(interaction, error, error.message || 'An error occurred while processing your request.');
        }
    }
};
