const { DiscordAPIError, EmbedBuilder } = require('discord.js');

const GATE_GUILD = '1240866080985976844';

module.exports = async (message, exemptBotId) => {
  try {
    // Check if message is from the exempt bot and has an embed
    if (message.author.id !== exemptBotId || !message.embeds.length) {
      console.log('Debug: Message rejected - wrong bot or no embeds');
      console.log('Message author:', message.author.id);
      console.log('Exempt bot:', exemptBotId);
      console.log('Has embeds:', message.embeds.length > 0);
      return;
    }
    // Get the embed
    const embed = message.embeds[0];
    
    if (!embed.title || !embed.title.includes('Automatic Summon!')) {
      console.log('Debug: Message rejected - wrong title');
      console.log('Embed title:', embed.title);
      return;
    }

    // Store the original message ID to track edits
    const originalMessageId = message.id;

    // Only setup token system for Gate guild
    if (message.guildId === GATE_GUILD) {
      console.log('Debug: Processing message in Gate guild');
      
      // Set up message collector for 19 seconds
      const filter = m => !m.author.bot; // Collect messages from non-bots
      const collector = message.channel.createMessageCollector({ 
        filter, 
        time: 19000 
      });

      collector.on('end', async collected => {
        console.log('Debug: Collector ended');
        console.log('Messages collected:', collected.size);
        
        if (collected.size > 0) {
          try {
            // Get Gate server data first
            const gateServerData = await message.client.database.mGateServerDB.findOne({ serverID: GATE_GUILD });
            console.log('Debug: Gate server data:', gateServerData);
            console.log('Debug: Economy enabled:', gateServerData?.economyEnabled);
            
            // Check if economy is enabled
            if (!gateServerData || !gateServerData.economyEnabled) {
              console.log('Economy disabled or server data not found');
              return;
            }

            // Get unique participants from collected messages
            const participants = [...new Set(collected.map(m => m.author.id))];
            console.log('Debug: Unique participants:', participants.length);
            
            // Determine number of winners (1-3)
            const numWinners = Math.floor(Math.random() * 3) + 1;
            console.log('Debug: Number of winners:', numWinners);
            
            // Randomly select winners without duplicates
            const winners = [];
            const participantsCopy = [...participants];
            for (let i = 0; i < numWinners && participantsCopy.length > 0; i++) {
              const winnerIndex = Math.floor(Math.random() * participantsCopy.length);
              winners.push(participantsCopy.splice(winnerIndex, 1)[0]);
            }
            console.log('Debug: Selected winners:', winners);

            // Process each winner
            let rewardMessage = '';
            let colorEmbed;

            for (const winnerID of winners) {
              // Generate token reward with adjusted probabilities
              let tokenReward;
              const rand = Math.random() * 100;
              console.log('Debug: Random roll for winner:', winnerID, 'Roll:', rand);

              if (rand < 0.001) { // 0.1% chance of 100 tokens
                tokenReward = 100;
                colorEmbed = '#FF00FF'; // Magenta
              } else if (rand < 0.01) { // 0.9% chance of 50 tokens
                tokenReward = 50;
                colorEmbed = '#00FFFF'; // Cyan
              } else if (rand < 0.1) { // 9% chance of 25 tokens
                tokenReward = 25;
                colorEmbed = '#FFFF00'; // Yellow
              } else { // 90.1% chance of 0-5 tokens
                tokenReward = Math.floor(Math.random() * 6);
                colorEmbed = '#00FF00'; // Green
              }
              console.log('Debug: Token reward calculated:', tokenReward);

              if (tokenReward > 0) {
                // Get user data
                let userData = await message.client.database.mGateDB.findOne({ userID: winnerID });
                console.log('Debug: User data found:', !!userData);
                
                if (!userData) {
                  await message.client.database.createGateUser(winnerID);
                  userData = await message.client.database.mGateDB.findOne({ userID: winnerID });
                  console.log('Debug: Created new user data');
                }

                // Check max token limit
                const currentTokens = userData.currency[0];
                console.log('Debug: Current tokens:', currentTokens);
                if (currentTokens + tokenReward > 25000) {
                  tokenReward = Math.max(0, 25000 - currentTokens);
                  console.log('Debug: Adjusted token reward due to cap:', tokenReward);
                }

                if (tokenReward > 0) {
                  // Update tokens
                  await message.client.database.mGateDB.updateOne(
                    { userID: winnerID },
                    { $inc: { 'currency.0': tokenReward } }
                  );
                  console.log('Debug: Tokens awarded successfully');

                  // Add to reward message
                  rewardMessage += `${message.client.users.cache.get(winnerID).username} earned ${tokenReward} <:Slime_Token:1304929154285703179> for participating!\n`;
                }
              }
            }

            if (rewardMessage) {
              const rewardEmbed = new EmbedBuilder()
                .setColor(colorEmbed)
                .setTitle('🎉 Token Rewards')
                .setDescription(rewardMessage)
                .setFooter({ text: `${participants.length} users participated` });

              await message.channel.send({ embeds: [rewardEmbed] });
              console.log(`Awarded tokens to ${winners.length} winners`);
            } else {
              console.log('Debug: No reward message generated');
            }

          } catch (error) {
            console.error('Error handling token reward:', error);
          }
        }
      });
    } else {
      console.log('Debug: Message not in Gate guild');
      console.log('Message guild:', message.guildId);
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
