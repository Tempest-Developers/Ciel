const { SR_PING_ROLE } = require('../utils/constants');
const { ensureUser } = require('../utils/database');
const { EmbedBuilder } = require('discord.js');
const { handleInteraction, handleCommandError, safeDefer } = require('../../../utility/interactionHandler');

module.exports = {
    subcommand: subcommand =>
        subcommand
            .setName('balance')
            .setDescription('Check tickets and token balance')
            .addUserOption(option =>
                option.setName('user')
                    .setDescription('User to check balance for (Lead only)')),

    async execute(interaction, { database, config }) {
        try {
            await safeDefer(interaction);

            const targetUser = interaction.options.getUser('user');
            
            if (targetUser && !config.leads.includes(interaction.user.id)) {
                return await handleInteraction(interaction, {
                    content: '❌ Only leads can check other users\' balance.',
                    ephemeral: true
                }, 'editReply');
            }

            const userToCheck = targetUser || interaction.user;
            
            // Use ensureUser utility function to get/create user data
            const userData = await ensureUser(userToCheck.id, database.mGateDB);

            const slimeTokens = userData.currency[0];
            const tickets = userData.currency[5] || 0;
            
            let premiumStatus = '';
            if (userData.premium?.active) {
                const expiresAt = new Date(userData.premium.expiresAt);
                const now = new Date();
                if (expiresAt > now) {
                    premiumStatus = `\n👑 Premium expires <t:${Math.floor(expiresAt.getTime() / 1000)}:R>`;
                } else {
                    // Update premium status directly using mGateDB
                    await database.mGateDB.updateOne(
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
            
            // Create an embed with a single description
            const balanceEmbed = new EmbedBuilder()
                .setColor('#7289DA')  // Discord Blurple
                .setTitle(`${userToCheck.username}'s Balance`)
                .setThumbnail(userToCheck.displayAvatarURL({ dynamic: true }))
                .setDescription(`:tickets: x${tickets} Ticket\n<:Slime_Token:1304929154285703179> ${slimeTokens} Slime Token\n${premiumStatus}`)
                .setTimestamp()
                .setFooter({ text: `${interaction.guild.name} Economy System` });
            
            return await handleInteraction(interaction, {
                embeds: [balanceEmbed],
                ephemeral: false
            }, 'editReply');

        } catch (error) {
            await handleCommandError(interaction, error, '❌ An error occurred while checking balance.');
        }
    }
};
