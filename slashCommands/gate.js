const { SlashCommandBuilder } = require('discord.js');
const { GATE_GUILD } = require('./gate/utils/constants');
const { handleCooldown } = require('./gate/utils/cooldown');
const { getServerData } = require('./gate/utils/database');

// Import commands
const nukeCommand = require('./gate/commands/nuke');
const helpCommand = require('./gate/commands/help');
const { toggle, togglecards } = require('./gate/commands/toggle');
const balanceCommand = require('./gate/commands/balance');
const buyCommand = require('./gate/commands/buy');
const giftCommand = require('./gate/commands/gift');
const giveawayCommand = require('./gate/commands/giveaway');
const topCommand = require('./gate/commands/top');
const { give, take } = require('./gate/commands/currency');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gate')
        .setDescription('Gate system commands')
        .addSubcommand(nukeCommand.subcommand)
        .addSubcommand(helpCommand.subcommand)
        .addSubcommand(toggle.subcommand)
        .addSubcommand(togglecards.subcommand)
        .addSubcommand(balanceCommand.subcommand)
        .addSubcommand(buyCommand.subcommand)
        .addSubcommand(giftCommand.subcommand)
        .addSubcommand(giveawayCommand.subcommand)
        .addSubcommand(topCommand.subcommand)
        .addSubcommand(give.subcommand)
        .addSubcommand(take.subcommand),

    async execute(interaction, { database, config }) {
        if (interaction.guild.id !== GATE_GUILD) {
            return;
        }

        const subcommand = interaction.options.getSubcommand();
        const { mGateServerDB } = database;

        const serverData = await getServerData(GATE_GUILD, mGateServerDB);

        if (!serverData.economyEnabled && ['balance', 'buy', 'gift', 'giveaway', 'give', 'take', 'top'].includes(subcommand)) {
            return interaction.reply({
                content: '❌ The gate system is currently disabled.',
                ephemeral: true
            });
        }

        const isLead = config.leads.includes(interaction.user.id);
        const cooldownResult = handleCooldown(interaction.user.id, isLead);
        
        if (cooldownResult.onCooldown) {
            return interaction.reply({
                content: `Please wait ${cooldownResult.timeLeft} seconds before using this command again.`,
                ephemeral: true
            });
        }

        try {
            switch (subcommand) {
                case 'nuke':
                    return await nukeCommand.execute(interaction, { database, config });
                case 'help':
                    return await helpCommand.execute(interaction, { database, config });
                case 'toggle':
                    return await toggle.execute(interaction, { database, config });
                case 'togglecards':
                    return await togglecards.execute(interaction, { database, config });
                case 'balance':
                    return await balanceCommand.execute(interaction, { database, config });
                case 'buy':
                    return await buyCommand.execute(interaction, { database });
                case 'gift':
                    return await giftCommand.execute(interaction, { database });
                case 'giveaway':
                    return await giveawayCommand.execute(interaction, { database });
                case 'top':
                    return await topCommand.execute(interaction, { database, config });
                case 'give':
                    return await give.execute(interaction, { database, config });
                case 'take':
                    return await take.execute(interaction, { database, config });
            }
        } catch (error) {
            console.error('Error in gate command:', error);
            if (!interaction.replied) {
                return interaction.reply({
                    content: '❌ An error occurred while processing your command.',
                    ephemeral: true
                });
            }
        }
    },

    async handleButton(interaction, { database }) {
        if (interaction.guild.id !== GATE_GUILD) {
            return;
        }

        try {
            if (interaction.customId.startsWith('giveaway_')) {
                await giveawayCommand.handleButton(interaction, { database });
                return;
            }
        } catch (error) {
            console.error('Error handling button:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ An error occurred while processing your interaction.',
                    ephemeral: true
                });
            } else if (interaction.deferred) {
                await interaction.editReply({
                    content: '❌ An error occurred while processing your interaction.',
                    ephemeral: true
                });
            }
        }
    }
};
