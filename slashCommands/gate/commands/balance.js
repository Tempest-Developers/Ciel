const { SR_PING_ROLE } = require('../utils/constants');
const { ensureUser } = require('../utils/database');

module.exports = {
    subcommand: subcommand =>
        subcommand
            .setName('balance')
            .setDescription('Check tickets and token balance')
            .addUserOption(option =>
                option.setName('user')
                    .setDescription('User to check balance for (Lead only)')),

    async execute(interaction, { database, config }) {
        const targetUser = interaction.options.getUser('user');
        
        if (targetUser && !config.leads.includes(interaction.user.id)) {
            return interaction.reply({
                content: '❌ Only leads can check other users\' balance.',
                ephemeral: true
            });
        }

        const { mGateDB } = database;
        const userToCheck = targetUser || interaction.user;
        const userData = await ensureUser(userToCheck.id, mGateDB);
        const slimeTokens = userData.currency[0];
        const tickets = userData.currency[5] || 0;
        
        let premiumStatus = '';
        if (userData.premium?.active) {
            const expiresAt = new Date(userData.premium.expiresAt);
            const now = new Date();
            if (expiresAt > now) {
                premiumStatus = `\n👑 Premium expires <t:${Math.floor(expiresAt.getTime() / 1000)}:R>`;
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
            ephemeral: false
        });
    }
};
