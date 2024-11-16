const { DiscordAPIError, EmbedBuilder } = require('discord.js');

const GATE_GUILD = '1240866080985976844';
const GATE_BOOSTER_ROLE = '1301138394079952948';
const GATE_CLAN_ROLE = '1299135748984934431';

const SUMMON_EVENT_DURATION = 19000; // 19 seconds
const MAX_WINNERS = 5;
const SPECIAL_REWARD_CHANCES = {
  incredibleLuck: 0.001,
  rareDrop: 0.01,
  luckyDraw: 0.1,
};
const TOKEN_REWARDS = {
  incredibleLuck: 100,
  rareDrop: 50,
  luckyDraw: 25,
};
const MAX_TOKENS = 30000;

module.exports = async (message, exemptBotId, database) => {
  try {
    // Check if message is from the exempt bot and has an embed
    if (message.author.id !== exemptBotId || !message.embeds.length) {
      return;
    }

    // Get the embed
    const embed = message.embeds[0];

    if (!embed.title || !embed.title.includes('Automatic Summon!')) {
      return;
    }

    // Store the original message ID to track edits
    const originalMessageId = message.id;

    // Only setup token system for Gate guild
    if (message.guildId === GATE_GUILD) {
      // Set up message collector for 19 seconds
      const filter = (m) => !m.author.bot;
      const collector = message.channel.createMessageCollector({
        filter,
        time: SUMMON_EVENT_DURATION,
      });

      collector.on('end', async (collected) => {
        if (collected.size > 0) {
          try {
            // Get Gate server data from database
            const gateServerData = await getGateServerData(database);

            // Check if economy is enabled
            if (!gateServerData || !gateServerData.economyEnabled) {
              return;
            }

            // Get unique participants from collected messages
            const participants = [...new Set(collected.map((m) => m.author.id))];

            // Determine number of winners (1-5)
            const numWinners = Math.floor(Math.random() * MAX_WINNERS) + 1;

            // Randomly select winners without duplicates
            const winners = selectWinners(participants, numWinners);

            // Process each winner
            const rewardMessage = await processWinners(
              winners,
              message,
              database,
              gateServerData
            );

            if (rewardMessage) {
              const rewardEmbed = createRewardEmbed(rewardMessage);
              await message.channel.send({ embeds: [rewardEmbed] });
            }
          } catch (error) {
            console.error('Error handling token reward:', error);
          }
        }
      });
    }

    // Return data for message update event to use
    return {
      messageId: originalMessageId,
      originalEmbed: embed,
    };
  } catch (error) {
    if (error instanceof DiscordAPIError && error.code === 50013) {
      console.error('Missing permissions to send message in channel:', message.channel.id);
    } else {
      console.error('Error handling summon embed:', error);
    }
  }
};

// Helper functions

async function getGateServerData(database) {
  const { mGateServerDB } = await database.connectDB();
  let gateServerData = await mGateServerDB.findOne({ serverID: GATE_GUILD });

  if (!gateServerData) {
    await database.createGateServer(GATE_GUILD);
    gateServerData = await mGateServerDB.findOne({ serverID: GATE_GUILD });
  }

  return gateServerData;
}

function selectWinners(participants, numWinners) {
  const winners = [];
  const participantsCopy = [...participants];

  for (let i = 0; i < numWinners && participantsCopy.length > 0; i++) {
    const winnerIndex = Math.floor(Math.random() * participantsCopy.length);
    winners.push(participantsCopy.splice(winnerIndex, 1)[0]);
  }

  return winners;
}

async function processWinners(winners, message, database, gateServerData) {
  let rewardMessage = '';
  let bonusMessage = '';
  let highestReward = 0;
  let colorEmbed = '#00FF00'; // Default green
  let hasBoosterRole = false;
  let hasSpecialReward = false;
  let hasClanRole = false;

  // Check if any participant has the booster role
  const boosterParticipants = winners.filter((winnerID) =>
    message.guild.members.cache.get(winnerID)?.roles.cache.has(GATE_BOOSTER_ROLE)
  );
  const clanParticipants = winners.filter((winnerID) =>
    message.guild.members.cache.get(winnerID)?.roles.cache.has(GATE_CLAN_ROLE)
  );
  hasBoosterRole = boosterParticipants.length > 0;
  hasClanRole = clanParticipants.length > 0;

  for (const winnerID of winners) {
    // Generate token reward with adjusted probabilities
    let tokenReward = 0;
    const rand = Math.random() * 100;

    if (rand < SPECIAL_REWARD_CHANCES.incredibleLuck) {
      tokenReward = TOKEN_REWARDS.incredibleLuck;
      highestReward = TOKEN_REWARDS.incredibleLuck;
      hasSpecialReward = true;
      rewardMessage += `🏆 **Incredible Luck!** What are the odds they won with this? 🎲\n`;
      break;
    } else if (rand < SPECIAL_REWARD_CHANCES.rareDrop) {
      tokenReward = TOKEN_REWARDS.rareDrop;
      if (highestReward < TOKEN_REWARDS.rareDrop) highestReward = TOKEN_REWARDS.rareDrop;
      hasSpecialReward = true;
      rewardMessage += `🏆 **Rare Drop!** Unbelievable fortune! 🎲\n`;
      break;
    } else if (rand < SPECIAL_REWARD_CHANCES.luckyDraw) {
      tokenReward = TOKEN_REWARDS.luckyDraw;
      if (highestReward < TOKEN_REWARDS.luckyDraw) highestReward = TOKEN_REWARDS.luckyDraw;
      hasSpecialReward = true;
      rewardMessage += `🏆 **Lucky Draw!** Quite a rare occurrence! 🎲\n`;
    } else {
      tokenReward = Math.floor(Math.random() * 5);
      if (highestReward < tokenReward) highestReward = tokenReward;
    }

    // Apply role bonus if booster role is present
    if ((hasBoosterRole && hasClanRole) || hasBoosterRole) {
      tokenReward = Math.floor(tokenReward * 1.5);
    } else if (hasClanRole) {
      tokenReward = Math.floor(tokenReward * 1.25);
    }

    if (tokenReward > 0) {
      // Get user data from database
      const { mGateDB } = await database.connectDB();
      let userData = await mGateDB.findOne({ userID: winnerID });

      if (!userData) {
        await database.createGateUser(winnerID);
        userData = await mGateDB.findOne({ userID: winnerID });
      }

      // Check max token limit
      const currentTokens = userData.currency[0];
      if (currentTokens + tokenReward > MAX_TOKENS) {
        tokenReward = Math.max(0, MAX_TOKENS - currentTokens);
      }

      if (tokenReward > 0) {
        // Update tokens directly in database
        await mGateDB.updateOne(
          { userID: winnerID },
          { $inc: { 'currency.0': tokenReward } }
        );

        // Add to reward message
        rewardMessage += `<@${winnerID}> +\`${tokenReward}\` <:Slime_Token:1304929154285703179>\n`;
      }
    }
  }

  // Add role bonus notation
  if ((hasBoosterRole && hasClanRole) || hasBoosterRole) {
    bonusMessage += `<a:Gate_Nitro:1307184792990781480> **Booster Role Present** \`+50%\` More <:Slime_Token:1304929154285703179>!\n`;
  } else if (hasClanRole) {
    bonusMessage += `<:GoldenGate_Logo:1307187315566706812> **Clan Role Present** \`+25%\` More <:Slime_Token:1304929154285703179>!\n`;
  }

  if (highestReward >= TOKEN_REWARDS.incredibleLuck) colorEmbed = '#FF00FF'; // Magenta
  else if (highestReward >= TOKEN_REWARDS.rareDrop) colorEmbed = '#00FFFF'; // Red
  else if (highestReward >= TOKEN_REWARDS.luckyDraw) colorEmbed = '#FFFF00'; // Yellow

  return { rewardMessage, bonusMessage, colorEmbed, hasSpecialReward };
}

function createRewardEmbed({ rewardMessage, bonusMessage, colorEmbed, hasSpecialReward }) {
  const rewardEmbed = new EmbedBuilder()
    .setColor(colorEmbed)
    .setTitle(hasSpecialReward ? '🌟 Bonus Power Ups! 🌟' : '🎉 Token Rewards')
    .setDescription(bonusMessage ? `${bonusMessage}` : `<:Slime_Token:1304929154285703179> are rewarded for chatting and claiming`)
    .addFields({
      name: `Winners`,
      // Add a fallback value if rewardMessage is empty
      value: rewardMessage || 'No winners this time!',
    })
    .setFooter({ 
      // Adjust footer calculation to handle empty rewardMessage
      text: `Claimers ${rewardMessage ? rewardMessage.split('\n').length - 1 : 0}  | \\gate help` 
    });

  return rewardEmbed;
}
