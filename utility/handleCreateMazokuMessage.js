
module.exports = async (message, exemptBotId) => {
  try {
    // Check if message is from the exempt bot and has an embed
    if (message.author.id !== exemptBotId || !message.embeds.length) {
      return;
    }
    // Get the embed
    const embed = message.embeds[0];
    // console.log(embed)
    // Check if it's a summon embed by looking for specific content
    if (!embed.title || !embed.title.includes('Automatic Summon!')) {
      return;
    }
    // Calculate timestamps
    const countdownTime = Math.floor(Date.now() / 1000) + 19;
    // Send countdown message
    const countdownMsg = await message.reply(`**Claim card <t:${countdownTime}:R> 📵**`);
    // Calculate the next summon time (2 minutes from now)
    const nextSummonTime = Math.floor(Date.now() / 1000) + 120;
    // Edit the countdown message after 18 seconds to show the next summon time
    setTimeout(async () => {
      try {
        await countdownMsg.edit(` **Next summon possible <t:${nextSummonTime}:R> 📵**`);
      } catch (error) {
        console.error('Error editing countdown message:', error);
      }
    }, 19000); // 19 seconds
    // Store the original message ID to track edits
    const originalMessageId = message.id;
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
