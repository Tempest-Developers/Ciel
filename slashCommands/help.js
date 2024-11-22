require('dotenv').config();
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType } = require('discord.js');
const { handleInteraction, handleCommandError, safeDefer } = require('../utility/interactionHandler');

// Add cooldown system
const cooldowns = new Map();
const COOLDOWN_DURATION = 5000; // 5 seconds in milliseconds

// Guild IDs
const GATE_GUILD = process.env.GATE_GUILD;
const MiMs_GUILD = process.env.MIMS_GUILD;

// Admin command emoji
const ADMIN_EMOJI = '⚡';

const COMMAND_DETAILS = {
    'leaderboard': {
        description: 'View rankings by tier, print ranges, or total claims',
        usage: [
            '`/leaderboard tier` - Show leaderboard for a specific tier',
            '`/leaderboard total` - Show total claims leaderboard'
        ],
        examples: [
            'View Common Tier leaderboard: `/leaderboard tier tier:CT`',
            'View total claims: `/leaderboard total`'
        ],
        adminOnly: false
    },
    'inventory': {
        description: 'View and manage your card collection with advanced filtering',
        usage: [
            '`/inventory` - View your entire card collection',
            '`/inventory name:` - Filter cards by character name',
            '`/inventory anime:` - Filter cards by anime series',
            '`/inventory tier:` - Filter cards by tier',
            '`/inventory version:` - Filter cards by print range'
        ],
        examples: [
            'View all your SR cards: `/inventory tier:SR`',
            'Find cards from Naruto: `/inventory anime:Naruto`'
        ],
        adminOnly: false
    },
    'mystats': {
        description: 'Detailed personal card collection statistics',
        usage: [
            '`/mystats overview` - General stats overview',
            '`/mystats best` - Best card in last 30 minutes',
            '`/mystats prints` - Print distribution',
            '`/mystats tiers` - Tier distribution',
            '`/mystats tier_times` - Average claim times by tier',
            '`/mystats print_times` - Average print claim times'
        ],
        examples: [
            'View your tier distribution: `/mystats tiers`',
            'Check your best recent card: `/mystats best`'
        ],
        adminOnly: false
    },
    'recent': {
        description: 'View recent card claims with tier filtering',
        usage: [
            '`/recent` - Show last 15 claims across all tiers',
            'Use dropdown to filter by specific tier'
        ],
        examples: [
            'View recent SR claims: Select SR in dropdown'
        ],
        adminOnly: false
    },
    'find': {
        description: 'Search cards by character name with autocomplete',
        usage: [
            '`/find card:` - Search for a specific card',
            'Use autocomplete to find exact card takes time after typing wait for `1` sec'
        ],
        examples: [
            'Find Naruto card: `/find card:Naruto`'
        ],
        adminOnly: false
    },
    'server': {
        description: 'View server-wide card statistics',
        usage: [
            '`/server overview` - Server stats overview',
            '`/server best` - Best server drop',
            '`/server tiers` - Tier distribution',
            '`/server prints` - Print distribution',
            '`/server tiertimes` - Average claim times by tier',
            '`/server printtimes` - Average print claim times'
        ],
        examples: [
            'View server tier distribution: `/server tiers`',
            'Check server best drop: `/server best`'
        ],
        adminOnly: false
    },
    'wishlist': {
        description: 'View and manage your card wishlist',
        usage: [
            '`/wishlist add` - Add/Remove a card from all Mazoku card list',
            '`/wishlist list` - View your wishlist',
            '`/wishlist global` - View global wishlist stats'
        ],
        examples: [
            'Add card to wishlist: `/wishlist add card_id`',
            'View your wishlist: `/wishlist list`'
        ],
        adminOnly: false
    },
    'register': {
        description: 'Register your server for bot usage',
        usage: [
            '`/register` - Register current server'
        ],
        examples: [
            'Register server: `/register`'
        ],
        adminOnly: true
    },
    'sconfig': {
        description: 'Configure server settings',
        usage: [
            '`/sconfig tier` - Toggle tier display in summon messages',
            '`/sconfig ping` - Toggle manual summon cooldown ping notifications'
        ],
        examples: [
            'Toggle tier display: `/sconfig tier`',
            'Toggle cooldown pings: `/sconfig ping`'
        ],
        adminOnly: true
    },
    'hstate': {
        description: 'View and manage hunt state',
        usage: [
            '`/hstate` - View current hunt state',
            '`/hstate toggle` - Toggle hunt state'
        ],
        examples: [
            'Toggle hunt state: `/hstate toggle`'
        ],
        adminOnly: true,
        guildRestricted: MiMs_GUILD
    },
    'giveaway': {
        description: 'Manage card giveaways',
        usage: [
            '`/giveaway create` - Create a new giveaway',
            '`/giveaway end` - End an active giveaway'
        ],
        examples: [
            'Create giveaway: `/giveaway create`'
        ],
        adminOnly: true,
        guildRestricted: MiMs_GUILD
    },
    'gate': {
        description: 'Gate currency system commands',
        usage: [
            '`/gate help` - View Gate commands',
            '`/gate balance` - Check your balance',
            '`/gate buy` - Purchase items'
        ],
        examples: [
            'Check balance: `/gate balance`',
            'Buy item: `/gate buy item:name`'
        ],
        adminOnly: false,
        guildRestricted: GATE_GUILD
    }
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Shows information about available commands'),
    
    async execute(interaction) {
        try {
            const guildId = interaction.guild.id;
            const userId = interaction.user.id;
            const cooldownKey = `${guildId}-${userId}`;
            
            if (cooldowns.has(cooldownKey)) {
                const expirationTime = cooldowns.get(cooldownKey);
                if (Date.now() < expirationTime) {
                    const timeLeft = (expirationTime - Date.now()) / 1000;
                    return await handleInteraction(interaction, { 
                        content: `Please wait ${timeLeft.toFixed(1)} seconds before using this command again.`,
                        ephemeral: true 
                    }, 'reply');
                }
            }

            cooldowns.set(cooldownKey, Date.now() + COOLDOWN_DURATION);
            setTimeout(() => cooldowns.delete(cooldownKey), COOLDOWN_DURATION);

            await safeDefer(interaction);

            // Filter commands based on guild restrictions
            const availableCommands = Object.entries(COMMAND_DETAILS)
                .filter(([_, details]) => {
                    if (details.guildRestricted) {
                        return details.guildRestricted === guildId;
                    }
                    return true;
                })
                .reduce((acc, [cmd, details]) => {
                    acc[cmd] = details;
                    return acc;
                }, {});

            // Create initial embed with command names only
            const helpEmbed = new EmbedBuilder()
                .setTitle('Mazoku Card Bot - Command List')
                .setColor('#FFC0CB')
                .setDescription(Object.entries(availableCommands)
                    .map(([cmd, details]) => {
                        const adminMark = details.adminOnly ? ADMIN_EMOJI : '';
                        return `\`/${cmd}\` ${adminMark}`;
                    })
                    .join('\n'))
                .setFooter({ text: 'Select a command from the dropdown for more details' });

            // Create dropdown with available commands
            const commandSelectMenu = new StringSelectMenuBuilder()
                .setCustomId('help_command_select')
                .setPlaceholder('Select a command to view detailed information')
                .addOptions(
                    Object.entries(availableCommands)
                        .map(([cmd, details]) => ({
                            label: `/${cmd}`,
                            value: cmd,
                            description: details.description.substring(0, 100),
                            emoji: details.adminOnly ? ADMIN_EMOJI : undefined
                        }))
                );

            const actionRow = new ActionRowBuilder().addComponents(commandSelectMenu);

            const response = await handleInteraction(interaction, { 
                embeds: [helpEmbed], 
                components: [actionRow],
                ephemeral: false 
            }, 'editReply');

            const collector = response.createMessageComponentCollector({
                componentType: ComponentType.StringSelect,
                time: 300000 // 5 minutes
            });

            collector.on('collect', async i => {
                try {
                    if (i.user.id !== interaction.user.id) {
                        await handleInteraction(i, { 
                            content: 'You cannot use these controls.', 
                            ephemeral: true 
                        }, 'reply');
                        return;
                    }

                    await i.deferUpdate();

                    const selectedCommand = i.values[0];
                    const commandInfo = availableCommands[selectedCommand];

                    const detailEmbed = new EmbedBuilder()
                        .setTitle(`${commandInfo.adminOnly ? ADMIN_EMOJI : ''}/${selectedCommand} Command Details`)
                        .setColor('#FFC0CB')
                        .addFields(
                            { name: 'Description', value: commandInfo.description },
                            { name: 'Usage', value: commandInfo.usage.join('\n') },
                            { name: 'Examples', value: commandInfo.examples.join('\n') }
                        )
                        .setFooter({ text: 'Select another command or close the help menu' });

                    await i.editReply({ embeds: [detailEmbed], components: [actionRow] });
                } catch (error) {
                    await handleCommandError(i, error, 'An error occurred while showing command details.');
                }
            });

            collector.on('end', async () => {
                try {
                    await response.edit({ components: [] });
                } catch (error) {
                    console.error('Error removing components:', error);
                }
            });

        } catch (error) {
            await handleCommandError(interaction, error, 'An error occurred while showing the help information.');
        }
    },
};
