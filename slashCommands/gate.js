const { SlashCommandBuilder } = require('discord.js');
const { GATE_GUILD } = require('./gate/utils/constants');
const { handleCooldown } = require('./gate/utils/cooldown');
const { getServerData } = require('./gate/utils/database');
const { handleInteraction, handleCommandError, safeDefer } = require('../utility/interactionHandler');

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
        try {
            if (interaction.guild.id !== GATE_GUILD) {
                return;
            }

            const subcommand = interaction.options.getSubcommand();
            const { mGateServerDB } = database;

            const serverData = await getServerData(GATE_GUILD, mGateServerDB);

            if (!serverData.economyEnabled && ['balance', 'buy', 'gift', 'giveaway', 'give', 'take', 'top'].includes(subcommand)) {
                return await handleInteraction(interaction, {
                    content: '❌ The gate system is currently disabled.',
                    ephemeral: true
                }, 'reply');
            }

            const isLead = config.leads.includes(interaction.user.id);
            const cooldownResult = handleCooldown(interaction.user.id, isLead);
            
            if (cooldownResult.onCooldown) {
                return await handleInteraction(interaction, {
                    content: `Please wait ${cooldownResult.timeLeft} seconds before using this command again.`,
                    ephemeral: true
                }, 'reply');
            }

            // Defer the response early to prevent timeouts
            await safeDefer(interaction);

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
                    case 'give':
                        return await give.execute(interaction, { database, config });
                    case 'take':
                        return await take.execute(interaction, { database, config });
                }
            } catch (error) {
                await handleCommandError(interaction, error, '❌ An error occurred while processing your command.');
            }
        } catch (error) {
            await handleCommandError(interaction, error, '❌ An error occurred while processing your command.');
        }
    },

    async handleButton(interaction, { database }) {
        try {
            if (interaction.guild.id !== GATE_GUILD) {
                return;
            }

            // Defer button response early
            await safeDefer(interaction, { ephemeral: true });

            if (interaction.customId.startsWith('giveaway_')) {
                await giveawayCommand.handleButton(interaction, { database });
                return;
            }
        } catch (error) {
            await handleCommandError(interaction, error, '❌ An error occurred while processing your interaction.');
        }
    }
};
