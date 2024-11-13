const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'giveawayannounce',
    description: 'Announce a specific giveaway',
    developerOnly: true,
    adminOnly: true,
    async execute(message, args, { database }) {
        // Check if user has required permissions
        if (!message.member.permissions.has('ADMINISTRATOR')) {
            return message.reply('❌ You must be an administrator to use this command.');
        }

        // Validate input
        if (args.length < 2) {
            return message.reply('❌ Usage: !giveawayannounce <giveaway-id> <channel-id>');
        }

        const giveawayId = parseInt(args[0]);
        const channelId = args[1];

        // Validate giveaway ID
        if (isNaN(giveawayId)) {
            return message.reply('❌ Invalid giveaway ID. Must be a number.');
        }

        try {
            // Fetch giveaway details
            const giveaway = await database.getGiveaway(giveawayId);
            
            if (!giveaway) {
                return message.reply(`❌ No giveaway found with ID ${giveawayId}.`);
            }

            // Find the channel
            const channel = message.guild.channels.cache.get(channelId);
            if (!channel) {
                return message.reply(`❌ Channel with ID ${channelId} not found.`);
            }

            // Create announcement embed
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('🎉 New Giveaway!')
                .setDescription(`**Item:** ${giveaway.item.name}\n` +
                                 `**Description:** ${giveaway.item.description || 'N/A'}\n` +
                                 `**Level:** ${giveaway.level}\n` +
                                 `**Tickets/Winners:** ${giveaway.amount}\n` +
                                 `**Ends:** <t:${giveaway.endTimestamp}:R>`)
                .setImage(giveaway.item.imageUrl || null);

            // Send announcement
            await channel.send({ embeds: [embed] });

            // Confirm announcement
            message.reply(`✅ Giveaway #${giveawayId} announced in <#${channelId}>`);
        } catch (error) {
            console.error('Giveaway announcement error:', error);
            message.reply('❌ Error announcing giveaway. Please check the details and try again.');
        }
    },
};
