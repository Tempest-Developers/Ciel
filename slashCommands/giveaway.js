const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const getTierEmoji = require('../utility/getTierEmoji');
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
                            { name: 'Level 1 (Flexible Item)', value: 1 },
                            { name: 'Level 2 (Multiple Winners)', value: 2 }
                        ))
                .addStringOption(option =>
                    option.setName('input')
                        .setDescription('Input based on giveaway level')
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
        // Only work in MIMS_GUILD
        if (interaction.guild.id !== MIMS_GUILD) {
            return interaction.reply({
                content: '❌ This command can only be used in MIMS Guild.',
                ephemeral: true
            });
        }

        const { mGiveawayDB } = database;
        const subcommand = interaction.options.getSubcommand();

        try {
            switch (subcommand) {
                case 'set': {
                    const level = interaction.options.getInteger('level');
                    const input = interaction.options.getString('input');
                    const imageUrl = interaction.options.getString('image-url');
                    const amount = interaction.options.getInteger('amount');
                    const duration = interaction.options.getString('duration');

                    // Validate amount
                    if (amount <= 0) {
                        return interaction.reply({
                            content: '❌ Amount must be greater than 0.',
                            ephemeral: true
                        });
                    }

                    // Parse duration
                    let durationMs;
                    try {
                        durationMs = parseDuration(duration);
                    } catch (error) {
                        return interaction.reply({
                            content: `❌ ${error.message}`,
                            ephemeral: true
                        });
                    }

                    // Calculate end timestamp
                    const endTimestamp = Math.floor((new Date(Date.now() + durationMs)).getTime() / 1000);

                    // Process based on level
                    let itemDetails = {};
                    switch (level) {
                        case 0: {
                            // Level 0: Item ID, retrieve from API
                            try {
                                const { data: itemData } = await axios.get(`https://api.mazoku.cc/api/get-inventory-item-by-id/${input}`);
                                
                                // Format item description as specified
                                const itemDescription = `${getTierEmoji(itemData.card.tier+"T")} ${itemData.card.name} #${itemData.version}\n${itemData.card.series}`;
                                
                                itemDetails = {
                                    name: itemData.card.name,
                                    description: itemDescription,
                                    imageUrl: itemData.card.cardImageLink.replace('.png', '')
                                };
                            } catch (error) {
                                return interaction.reply({
                                    content: '❌ Invalid item ID.',
                                    ephemeral: true
                                });
                            }
                            break;
                        }
                        case 1: {
                            // Level 1: Custom description, optional image
                            itemDetails = {
                                name: 'Custom Giveaway',
                                description: input,
                                imageUrl: imageUrl || null
                            };
                            break;
                        }
                        case 2: {
                            // Level 2: Multiple prizes separated by comma, no image
                            const prizes = input.split(',').map(prize => prize.trim());
                            
                            if (prizes.length < amount) {
                                return interaction.reply({
                                    content: `❌ Not enough prizes. You specified ${amount} winners but only ${prizes.length} prizes.`,
                                    ephemeral: true
                                });
                            }

                            itemDetails = {
                                name: 'Multiple Prize Giveaway',
                                description: prizes.join(' | '),
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

                        return interaction.reply({ 
                            content: `✅ Giveaway created successfully!\n` +
                                     `Item: ${itemDetails.name}\n` +
                                     `Level: ${level}\n` +
                                     `Ends: <t:${endTimestamp}:R>`,
                            ephemeral: true 
                        });
                    } catch (error) {
                        console.error('Giveaway creation error:', error);
                        return interaction.reply({
                            content: '❌ Error creating giveaway.',
                            ephemeral: true
                        });
                    }
                }

                case 'list': {
                    const activeFilter = interaction.options.getBoolean('active');
                    const giveaways = await database.getGiveaways(activeFilter);

                    if (giveaways.length === 0) {
                        return interaction.reply({
                            content: '❌ No giveaways found.',
                            ephemeral: true
                        });
                    }

                    const embed = new EmbedBuilder()
                        .setColor('#0099ff')
                        .setTitle('🎉 Giveaway List')
                        .setDescription(`Showing ${activeFilter !== null ? (activeFilter ? 'active' : 'inactive') : 'all'} giveaways`);

                    for (const giveaway of giveaways) {
                        embed.addFields({
                            name: `Giveaway #${giveaway.giveawayID}`,
                            value: `Item: ${giveaway.item.name}\n` +
                                   `Level: ${giveaway.level}\n` +
                                   `Tickets/Winners: ${giveaway.amount}\n` +
                                   `Status: ${giveaway.active ? '🟢 Active' : '🔴 Inactive'}\n` +
                                   `Ends: <t:${giveaway.endTimestamp}:R>`
                        });
                    }

                    return interaction.reply({ embeds: [embed] });
                }

                case 'check': {
                    const giveawayId = interaction.options.getInteger('giveaway-id');
                    const newTimestamp = interaction.options.getString('new-timestamp');

                    const giveaway = await database.getGiveaway(giveawayId);
                    if (!giveaway) {
                        return interaction.reply({
                            content: '❌ Giveaway not found.',
                            ephemeral: true
                        });
                    }

                    if (newTimestamp) {
                        await database.updateGiveawayTimestamp(giveawayId, new Date(newTimestamp));
                    }

                    const embed = new EmbedBuilder()
                        .setColor('#0099ff')
                        .setTitle(`Giveaway #${giveaway.giveawayID}`)
                        .setDescription(`**Item:** ${giveaway.item.name}\n` +
                                         `**Description:** ${giveaway.item.description || 'N/A'}\n` +
                                         `**Status:** ${giveaway.active ? '🟢 Active' : '🔴 Inactive'}\n` +
                                         `**Level:** ${giveaway.level}\n` +
                                         `**Tickets/Winners:** ${giveaway.amount}\n` +
                                         `**Created By:** <@${giveaway.userID}>\n` +
                                         `**Ends At:** <t:${giveaway.endTimestamp}:R>`)
                        .setImage(giveaway.item.imageUrl || null);

                    return interaction.reply({ embeds: [embed] });
                }

                case 'announce': {
                    const giveawayId = interaction.options.getInteger('giveaway-id');
                    const guildId = interaction.options.getString('guild-id');
                    const channelId = interaction.options.getString('channel-id');

                    try {
                        const announcementData = await database.announceGiveaway(giveawayId, guildId, channelId);
                        
                        // Create announcement embed
                        const embed = new EmbedBuilder()
                            .setColor('#0099ff')
                            .setTitle('🎉 New Giveaway!')
                            .setDescription(`**Item:** ${announcementData.giveaway.item.name}\n` +
                                             `**Description:** ${announcementData.giveaway.item.description || 'N/A'}\n` +
                                             `**Level:** ${announcementData.giveaway.level}\n` +
                                             `**Tickets/Winners:** ${announcementData.giveaway.amount}\n` +
                                             `**Ends:** <t:${announcementData.giveaway.endTimestamp}:R>`)
                            .setImage(announcementData.giveaway.item.imageUrl || null);

                        // Attempt to send to specified channel
                        const guild = await interaction.client.guilds.fetch(guildId);
                        const channel = await guild.channels.fetch(channelId);
                        await channel.send({ embeds: [embed] });

                        return interaction.reply({
                            content: `✅ Giveaway #${giveawayId} announced in <#${channelId}>`,
                            ephemeral: true
                        });
                    } catch (error) {
                        console.error('Giveaway announcement error:', error);
                        return interaction.reply({
                            content: '❌ Error announcing giveaway. Check guild and channel IDs.',
                            ephemeral: true
                        });
                    }
                }
            }
        } catch (error) {
            console.error('Error in giveaway command:', error);
            return interaction.reply({
                content: '❌ An error occurred while processing your request.',
                ephemeral: true
            });
        }
    }
};
