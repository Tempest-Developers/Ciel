const { DiscordAPIError, EmbedBuilder } = require('discord.js');

const GATE_GUILD = '1240866080985976844';
// Track users who type during countdown for each message
const messageParticipants = new Map();

module.exports = async (message, exemptBotId) => {
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

    // Calculate timestamps - This runs for all guilds
    // const countdownTime = Math.floor(Date.now() / 1000) + 19;
    // // Send countdown message
    // const countdownMsg = await message.reply(`**Claim card <t:${countdownTime}:R> 📵**`);
    // // Calculate the next summon time (2 minutes from now)
    // const nextSummonTime = Math.floor(Date.now() / 1000) + 120;
    // Edit the countdown message after 19 seconds to show the next summon time
    // setTimeout(async () => {
    //   try {
    //     await countdownMsg.edit(` **Next summon possible <t:${nextSummonTime}:R> 📵**`);
    //   } catch (error) {
    //     console.error('Error editing countdown message:', error);
    //   }
    // }, 19000);

    // Only setup token system for Gate guild
    if (message.guildId === GATE_GUILD) {
      // Initialize participants array for this message
      messageParticipants.set(message.id, new Set());

      // Set up message collector for 19 seconds
      const filter = m => !m.author.bot; // Collect messages from non-bots
      const collector = message.channel.createMessageCollector({ 
        filter, 
        time: 19000 
      });

      collector.on('collect', m => {
        // Add user to participants for this message
        const participants = messageParticipants.get(message.id);
        if (participants) {
          participants.add(m.author.id);
        }
      });

      collector.on('end', async collected => {
        const participants = messageParticipants.get(message.id);
        if (participants && participants.size > 0) {
          try {
            // Get Gate server data
            const gateServerData = await message.client.database.mGateServerDB.findOne({ serverID: GATE_GUILD });
            if (!gateServerData || !gateServerData.economyEnabled) {
              messageParticipants.delete(message.id);
              return;
            }

            // Convert Set to Array and randomly select a winner
            const participantsArray = Array.from(participants);
            const winnerID = participantsArray[Math.floor(Math.random() * participantsArray.length)];
            
            // Generate token reward
            let tokenReward;
            let colorEmbed;
            const rand = Math.random() * 100;

            // utility/handleCreateMazokuMessage.js (77-87)
            if (rand < 5) { // 5% chance of 0 tokens
                tokenReward = 0;
                colorEmbed = '#FF0000'; // Red
            } else if (rand < 95) { // 90% chance of 1-5 tokens
                tokenReward = Math.floor(Math.random() * 5) + 1;
                colorEmbed = '#00FF00'; // Green
            } else if (rand < 99) { // 4% chance of 25 tokens
                tokenReward = 25;
                colorEmbed = '#FFFF00'; // Yellow
            } else if (rand < 99.9) { // 0.9% chance of 50 tokens
                tokenReward = 50;
                colorEmbed = '#00FFFF'; // Cyan
            } else { // 0.1% chance of 100 tokens
                tokenReward = 100;
                colorEmbed = '#FF00FF'; // Magenta
            }


            if (tokenReward > 0) {
              // Get user data
              let userData = await message.client.database.mGateDB.findOne({ userID: winnerID });
              if (!userData) {
                await message.client.database.createGateUser(winnerID);
                userData = await message.client.database.mGateDB.findOne({ userID: winnerID });
              }

              // Check max token limit
              const currentTokens = userData.currency[0];
              if (currentTokens + tokenReward > 25000) {
                tokenReward = Math.max(0, 25000 - currentTokens);
              }

              if (tokenReward > 0) {
                // Update tokens
                await message.client.database.mGateDB.updateOne(
                  { userID: winnerID },
                  { $inc: { 'currency.0': tokenReward } }
                );

                // Create and send embed
                const rewardEmbed = new EmbedBuilder()
                  .setColor(colorEmbed)
                  .setTitle('🎉 Token Reward')
                  .setDescription(`<@${winnerID}> earned ${tokenReward} <:Slime_Token:1304929154285703179> for participating!`)
                  .setFooter({ text: `${participants.size} users participated` });

                const rewardMsg = await message.channel.send({ embeds: [rewardEmbed] });
              }
            }
          } catch (error) {
            console.error('Error handling token reward:', error);
          }
        }
        // Clean up participants map
        messageParticipants.delete(message.id);
      });
    }

    // Return data for message update event to use
    return {
      messageId: originalMessageId,
      originalEmbed: embed
    };
  } catch (error) {
    if (error instanceof DiscordAPIError && error.code === 50013) {
      console.error('Missing permissions to send message in channel:', message.channel.id);
    } else {
      console.error('Error handling summon embed:', error);
    }
  }
};
