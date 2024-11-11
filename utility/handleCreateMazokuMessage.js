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
            const rand = Math.random() * 100;

            if (rand < 20) { // 20% chance of 0 tokens
                tokenReward = 0;
            } else if (rand < 50) { // 30% chance of 1-3 tokens
                tokenReward = Math.floor(Math.random() * 3) + 1;
            } else if (rand < 75) { // 25% chance of 4-6 tokens
                tokenReward = Math.floor(Math.random() * 3) + 4;
            } else if (rand < 95) { // 20% chance of 7-9 tokens
                tokenReward = Math.floor(Math.random() * 3) + 7;
            } else { // 5% chance of 10 tokens
                tokenReward = 10;
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
                  .setColor('#00ff00')
                  .setTitle('🎉 Token Reward')
                  .setDescription(`<@${winnerID}> earned ${tokenReward} <:Slime_Token:1304929154285703179> for participating!`)
                  .setFooter({ text: `${participants.size} users participated` });

                const rewardMsg = await message.channel.send({ embeds: [rewardEmbed] });

                // Delete reward message after 10 seconds
                // setTimeout(() => {
                //   rewardMsg.delete().catch(console.error);
                // }, 10000);
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
