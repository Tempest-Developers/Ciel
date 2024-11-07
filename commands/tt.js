const { connectDB } = require('../database/mongo');
const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'tt',
  description: 'Show card counts leaderboard or filter by tier',
  developerOnly: true,
  adminOnly: true,
  async execute(message, args) {
    const serverID = '1240866080985976844'; // Hardcoded serverID
    const { playerDB } = await connectDB();
    const validTiers = ['CT', 'RT', 'SRT', 'SSRT'];
    const tier = args[0]?.toUpperCase();

    // Get all players who have claims
    const players = await playerDB.find({
      'claims.serverID': serverID,
      'claims': { $exists: true, $ne: [] }
    }).toArray();

    if (players.length === 0) {
      return message.reply('No players found with cards in this server.');
    }

    // Process player data
    const processedPlayers = players.map(player => {
      // Filter claims for this server
      const serverClaims = player.claims.filter(claim => claim.serverID === serverID);
      
      // Count cards by tier for this server
      const tierCounts = {
        CT: 0, RT: 0, SRT: 0, SSRT: 0
      };
      
      serverClaims.forEach(claim => {
        if (tierCounts.hasOwnProperty(claim.tier)) {
          tierCounts[claim.tier]++;
        }
      });

      return {
        userID: player.userID,
        tierCounts,
        total: Object.values(tierCounts).reduce((sum, count) => sum + count, 0)
      };
    });

    // Sort players based on tier or total
    if (tier && validTiers.includes(tier)) {
      processedPlayers.sort((a, b) => b.tierCounts[tier] - a.tierCounts[tier]);
    } else {
      processedPlayers.sort((a, b) => b.total - a.total);
    }

    // Create embed
    const embed = new EmbedBuilder()
    .setColor('#0099ff')
    .setTitle(tier && validTiers.includes(tier) ? `${message.guild.name} - ${tier} Card Leaderboard` : `${message.guild.name} - Total Cards Leaderboard`)
    .setTimestamp();

    // Generate leaderboard text
    let description = '';
    for (let i = 0; i < Math.min(processedPlayers.length, 15); i++) {
      const player = processedPlayers[i];
      const user = await message.client.users.fetch(player.userID).catch(() => null);
      const username = user ? user.username : 'Unknown User';

      if (tier && validTiers.includes(tier)) {
        description += `${i + 1}. **${username}** - ${getTierEmoji(tier)}: ${player.tierCounts[tier]}\n`;
      } else {
        description += `${i + 1}. **${username}** - Total: ${player.total} \n` +
          `   (<:C_Gate:1300919916685164706>: ${player.tierCounts.CT}, ` +
          `<:R_Gate:1300919898209386506>: ${player.tierCounts.RT}, ` +
          `<:SR_Gate:1300919875757146214>: ${player.tierCounts.SRT}, ` +
          `<:SSR_Gate:1300919858053124163>: ${player.tierCounts.SSRT})\n`;
      }
    }

    embed.setDescription(description || 'No players found.');
    message.channel.send({ embeds: [embed] });
  }
};

function getTierEmoji(tier) {
  switch (tier) {
    case 'CT':
      return '<:C_Gate:1300919916685164706>';
    case 'RT':
      return '<:R_Gate:1300919898209386506>';
    case 'SRT':
      return '<:SR_Gate:1300919875757146214>';
    case 'SSRT':
      return '<:SSR_Gate:1300919858053124163>';
    default:
      return '';
  }
}
