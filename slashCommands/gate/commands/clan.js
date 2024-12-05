const { SlashCommandBuilder } = require('discord.js');
const { handleInteraction, handleCommandError, safeDefer } = require('../../../utility/interactionHandler');
const { ensureUser } = require('../utils/database');
const { handleCooldown } = require('../utils/cooldown');

const CLAN_ROLE_ID = '1299135748984934431';
const HIGH_TIER_PING_ROLE_ID = '1305567492277796908';
const COOLDOWN = 60; // 60 seconds cooldown

module.exports = {
    subcommand: subcommand =>
        subcommand
            .setName('clan')
            .setDescription('Action for High-Tier-Ping Role')
            .addStringOption(option =>
                option.setName('action')
                    .setDescription('Action to perform')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Add', value: 'add' },
                        { name: 'Remove', value: 'remove' }
                    )),

    async execute(interaction, { database }) {
        try {
            await safeDefer(interaction, { ephemeral: true });

            // Check if user has the clan role
            if (!interaction.member.roles.cache.has(CLAN_ROLE_ID)) {
                return await handleInteraction(interaction, {
                    content: '❌ You do not have permission to use this command.',
                    ephemeral: true
                }, 'editReply');
            }

            // Check cooldown at the beginning
            const initialCooldownCheck = handleCooldown(interaction.user.id, false);
            console.log(`Debug: Initial cooldown check:`, initialCooldownCheck);

            if (initialCooldownCheck.onCooldown) {
                return await handleInteraction(interaction, {
                    content: `❌ This command is on cooldown. Please try again in ${initialCooldownCheck.timeLeft} seconds.`,
                    ephemeral: true
                }, 'editReply');
            }

            const action = interaction.options.getString('action');
            const userData = await ensureUser(interaction.user.id, database.mGateDB);

            let commandExecuted = false;

            if (action === 'add') {
                if (interaction.member.roles.cache.has(HIGH_TIER_PING_ROLE_ID)) {
                    return await handleInteraction(interaction, {
                        content: '❌ You already have the High-Tier-Ping role.',
                        ephemeral: true
                    }, 'editReply');
                }

                await interaction.member.roles.add(HIGH_TIER_PING_ROLE_ID);
                commandExecuted = true;
                await handleInteraction(interaction, {
                    content: '✅ Successfully added the High-Tier-Ping role to yourself.',
                    ephemeral: false
                }, 'editReply');
            } else if (action === 'remove') {
                if (userData.premium?.active) {
                    return await handleInteraction(interaction, {
                        content: '❌ Cannot remove the High-Tier-Ping role. You have an active premium subscription.',
                        ephemeral: true
                    }, 'editReply');
                }

                if (!interaction.member.roles.cache.has(HIGH_TIER_PING_ROLE_ID)) {
                    return await handleInteraction(interaction, {
                        content: '❌ You do not have the High-Tier-Ping role.',
                        ephemeral: true
                    }, 'editReply');
                }

                await interaction.member.roles.remove(HIGH_TIER_PING_ROLE_ID);
                commandExecuted = true;
                await handleInteraction(interaction, {
                    content: '✅ Successfully removed the High-Tier-Ping role from yourself.',
                    ephemeral: false
                }, 'editReply');
            }

            // Apply cooldown only if the command was executed successfully
            if (commandExecuted) {
                const finalCooldownResult = handleCooldown(interaction.user.id, false);
                console.log(`Debug: Final cooldown applied. Result:`, finalCooldownResult);
            } else {
                console.log(`Debug: Command not executed, cooldown not applied.`);
            }

        } catch (error) {
            console.error('Error in clan command:', error);
            await handleCommandError(interaction, error, '❌ An error occurred while processing your request.');
        }
    }
};
