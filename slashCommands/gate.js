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
        .addSubcommand(give.subcommand)
        .addSubcommand(take.subcommand),

    async execute(interaction, { database, config }) {
        // Silently ignore if not in Gate Guild
        if (interaction.guild.id !== GATE_GUILD) {
            return;
        }

        const subcommand = interaction.options.getSubcommand();
        const { mGateServerDB } = database;

        // Get server settings
        const serverData = await getServerData(GATE_GUILD, mGateServerDB);

        // Check if economy is enabled for economy-related commands
        if (!serverData.economyEnabled && ['balance', 'buy', 'gift', 'giveaway', 'give', 'take'].includes(subcommand)) {
            return interaction.reply({
                content: '❌ The gate system is currently disabled.',
                ephemeral: true
            });
        }

        // Check cooldown
        const isLead = config.leads.includes(interaction.user.id);
        const cooldownResult = handleCooldown(interaction.user.id, isLead);
        
        if (cooldownResult.onCooldown) {
            return interaction.reply({
                content: `Please wait ${cooldownResult.timeLeft} seconds before using this command again.`,
                ephemeral: true
            });
        }

        try {
            // Execute the appropriate subcommand
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
                case 'give':
                    return await give.execute(interaction, { database, config });
                case 'take':
                    return await take.execute(interaction, { database, config });
            }
        } catch (error) {
            console.error('Error in gate command:', error);
            return interaction.reply({
                content: '❌ An error occurred while processing your command.',
                ephemeral: true
            });
        }
    },

    // Add button interaction handler
    async handleButton(interaction, { database, config }) {
        // Silently ignore if not in Gate Guild
        if (interaction.guild.id !== GATE_GUILD) {
            return;
        }

        // Extract the command name from the message that created the button
        const commandName = interaction.message?.interaction?.commandName;
        if (commandName !== 'gate') return;

        // Get the subcommand name from the original interaction
        const subcommandName = interaction.message?.interaction?.options?.getSubcommand();
        if (!subcommandName) return;

        try {
            // Route the button interaction to the appropriate subcommand
            switch (subcommandName) {
                case 'giveaway':
                    if (giveawayCommand.handleButton) {
                        return await giveawayCommand.handleButton(interaction, { database });
                    }
                    break;
                // Add other subcommands with button handlers here
            }
        } catch (error) {
            console.error('Error handling button interaction:', error);
            return interaction.reply({
                content: '❌ An error occurred while processing your interaction.',
                ephemeral: true
            });
        }
    }
};
