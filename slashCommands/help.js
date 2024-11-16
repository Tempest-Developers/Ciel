const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType } = require('discord.js');

// Add cooldown system
const cooldowns = new Map();
const COOLDOWN_DURATION = 5000; // 5 seconds in milliseconds

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
        ]
    },
    'mycards': {
        description: 'View and manage your card collection with advanced filtering',
        usage: [
            '`/mycards` - View your entire card collection',
            '`/mycards name:` - Filter cards by character name',
            '`/mycards anime:` - Filter cards by anime series',
            '`/mycards tier:` - Filter cards by tier',
            '`/mycards version:` - Filter cards by print range'
        ],
        examples: [
            'View all your SR cards: `/mycards tier:SR`',
            'Find cards from Naruto: `/mycards anime:Naruto`'
        ]
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
        ]
    },
    'recent': {
        description: 'View recent card claims with tier filtering',
        usage: [
            '`/recent` - Show last 15 claims across all tiers',
            'Use dropdown to filter by specific tier'
        ],
        examples: [
            'View recent SR claims: Select SR in dropdown'
        ]
    },
    'search': {
        description: 'Search cards by character name with autocomplete',
        usage: [
            '`/search card:` - Search for a specific card',
            'Use autocomplete to find exact card takes time after typing wait for `1` sec'
        ],
        examples: [
            'Find Naruto card: `/search card:Naruto`'
        ]
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
        ]
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
        ]
    },
    'allowtierdisplay': {
        description: 'Toggle high tier role ping feature (Admin Only)',
        usage: [
            '`/allowtierdisplay` - Toggle tier display for server'
        ],
        examples: [
            'Enable tier display: `/allowtierdisplay`'
        ]
    },
    'registerguild': {
        description: 'Register your server for bot usage (Admin Only)',
        usage: [
            '`/registerguild` - Register current server'
        ],
        examples: [
            'Register server: `/registerguild`'
        ]
    }
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Shows information about available commands'),
    
    async execute(interaction) {
        // Add cooldown check
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const cooldownKey = `${guildId}-${userId}`;
        
        if (cooldowns.has(cooldownKey)) {
            const expirationTime = cooldowns.get(cooldownKey);
            if (Date.now() < expirationTime) {
                const timeLeft = (expirationTime - Date.now()) / 1000;
                return await interaction.reply({ 
                    content: `Please wait ${timeLeft.toFixed(1)} seconds before using this command again.`,
                    ephemeral: true 
                });
            }
        }

        // Set cooldown
        cooldowns.set(cooldownKey, Date.now() + COOLDOWN_DURATION);
        setTimeout(() => cooldowns.delete(cooldownKey), COOLDOWN_DURATION);

        try {
            // Create a more comprehensive initial embed with a detailed list of commands
            const helpEmbed = new EmbedBuilder()
                .setTitle('Mazoku Card Bot - Command List')
                .setColor('#FFC0CB')
                .setDescription('**All Available Commands:**')
                .addFields(
                    Object.entries(COMMAND_DETAILS).map(([cmd, details]) => ({
                        name: `\`/${cmd}\``,
                        value: `*${details.description}*`,
                        inline: false
                    }))
                )
                .setFooter({ text: 'Select a command from the dropdown for more details' });

            const commandSelectMenu = new StringSelectMenuBuilder()
                .setCustomId('help_command_select')
                .setPlaceholder('Select a command to view detailed information')
                .addOptions(
                    Object.keys(COMMAND_DETAILS)
                        .filter(cmd => !['ping', 'giveaway'].includes(cmd))
                        .map(cmd => ({
                            label: `/${cmd}`,
                            value: cmd,
                            description: COMMAND_DETAILS[cmd].description.substring(0, 100)
                        }))
                );

            const actionRow = new ActionRowBuilder().addComponents(commandSelectMenu);

            const response = await interaction.reply({ 
                embeds: [helpEmbed], 
                components: [actionRow],
                ephemeral: false 
            });

            const collector = response.createMessageComponentCollector({
                componentType: ComponentType.StringSelect,
                time: 300000 // 5 minutes
            });

            collector.on('collect', async i => {
                if (i.user.id !== interaction.user.id) {
                    await i.reply({ 
                        content: 'You cannot use these controls.', 
                        ephemeral: true 
                    });
                    return;
                }

                const selectedCommand = i.values[0];
                const commandInfo = COMMAND_DETAILS[selectedCommand];

                const detailEmbed = new EmbedBuilder()
                    .setTitle(`/${selectedCommand} Command Details`)
                    .setColor('#FFC0CB')
                    .addFields(
                        { name: 'Description', value: commandInfo.description },
                        { name: 'Usage', value: commandInfo.usage.join('\n') },
                        { name: 'Examples', value: commandInfo.examples.join('\n') }
                    )
                    .setFooter({ text: 'Select another command or close the help menu' });

                await i.update({ embeds: [detailEmbed], components: [actionRow] });
            });

            collector.on('end', async () => {
                try {
                    await response.edit({ components: [] });
                } catch (error) {
                    console.error('Error removing components:', error);
                }
            });

        } catch (error) {
            console.error('Error executing help command:', error);
            await interaction.reply({ 
                content: 'An error occurred while showing the help information.',
                ephemeral: true 
            });
        }
    },
};
