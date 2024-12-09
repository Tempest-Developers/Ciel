const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { handleInteraction, handleCommandError, safeDefer } = require('../utility/interactionHandler');
const axios = require('axios');
const getTierEmoji = require('../utility/getTierEmoji');

const cooldowns = new Map();
const COOLDOWN_DURATION = 15000; // 30 seconds
const API_TIMEOUT = 15000; // 15 seconds timeout for API calls

module.exports = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('Display user profile information')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to get profile information for (default: yourself)')
        .setRequired(false)),

  async execute(interaction) {
    const { user } = interaction;
    const guildId = interaction.guild.id;

    // Check for cooldown
    if (!cooldowns.has(guildId)) {
      cooldowns.set(guildId, new Map());
    }
    
    const guildCooldowns = cooldowns.get(guildId);
    
    if (guildCooldowns.has(user.id)) {
      const expirationTime = guildCooldowns.get(user.id) + COOLDOWN_DURATION;
      if (Date.now() < expirationTime) {
        const timeLeft = (expirationTime - Date.now()) / 1000;
        return await handleInteraction(interaction, { 
          content: `Please wait ${timeLeft.toFixed(1)} seconds before using this command again.`,
          ephemeral: true 
        }, 'reply');
      }
    }

    try {
      // Defer the reply without making it ephemeral
      await safeDefer(interaction);

      const targetUser = interaction.options.getUser('user') || interaction.user;
      const userId = targetUser.id;

      // Inform user that data is being fetched (ephemeral message)
      await handleInteraction(interaction, { 
        content: 'Fetching profile data, please wait...',
        ephemeral: true 
      }, 'followUp');

      // Fetch user data from Mazoku API with timeout
      const userData = await axios.get(`https://api.mazoku.cc/api/get-user/${userId}`, { timeout: API_TIMEOUT });
      
      // Fetch inventory data for each tier
      const tiers = ['C', 'R', 'SR', 'SSR', 'UR'];
      const cardCounts = {};
      let totalWorth = 0;

      for (const tier of tiers) {
        const requestBody = {
          page: 1,
          pageSize: 1,
          name:"",
          type: "Card",
          sortBy: "dateAdded",
          sortOrder: "desc",
          tiers: [tier],
          minVersion: 0,
          maxVersion: 2000,
          owner: userId
        };

        const inventoryData = await axios.post('https://api.mazoku.cc/api/get-inventory-items/', requestBody, { timeout: API_TIMEOUT });
        cardCounts[tier] = inventoryData.data.cardCount;
      }

      const totalCards = Object.values(cardCounts).reduce((a, b) => a + b, 0);
      const daysSinceRegistered = calculateDaysSinceRegistered(userData.data.registrationDate);

      // Create embed
      const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`${targetUser.username}'s Mazoku Profile`)
        .setThumbnail(`https://cdn.discordapp.com/avatars/${userId}/${userData.data.avatar}.png`)
        .setImage(`https://cdn.mazoku.cc/banners/${userData.data.selectedBanner}/banner`)
        .addFields(
          { name: 'Balance', value: `<:bloodstone:1315603629591498762> \`${userData.data.bloodStones}\`\n<:moonstone:1315604285710401576> \`${userData.data.moonStones}\``, inline: true },
          { name: 'Registered', value: `\`${daysSinceRegistered}\` days ago`, inline: true },
          { name: 'Card Collection', value: formatCardCollection(cardCounts, totalCards, userData.data.isPremiumAccount), inline: false },
          { name: 'Premium Status', value: formatPremiumStatus(userData.data), inline: false }
        )
        .setFooter({ text: 'Banner shown is the one set on your profile' });

      // Create buttons
      const profileButton = new ButtonBuilder()
        .setLabel('View Profile on Website')
        .setStyle(ButtonStyle.Link)
        .setURL(`https://mazoku.cc/user/${userId}`);

      const storeButton = new ButtonBuilder()
        .setLabel('Mazoku Store')
        .setStyle(ButtonStyle.Link)
        .setURL('https://mazoku.cc/store');

      const row = new ActionRowBuilder().addComponents(profileButton, storeButton);

      // Send the profile embed with buttons (not ephemeral)
      await handleInteraction(interaction, { 
        embeds: [embed],
        components: [row]
      }, 'editReply');

      // Apply cooldown only after successful execution
      guildCooldowns.set(user.id, Date.now());

    } catch (error) {
      console.error('API Error:', error);
      let errorMessage = 'An error occurred while fetching data from the Mazoku API. Please try again later.';
      
      if (error.code === 'ECONNABORTED') {
        errorMessage = 'The Mazoku API is taking longer than usual to respond. Please try again in a few minutes.';
      } else if (error.response && error.response.status === 404) {
        errorMessage = 'User not found in the Mazoku database. Make sure the user has registered with Mazoku.';
      }
      
      await handleCommandError(interaction, error, errorMessage);
    }
  }
};

function calculateTierWorth(tier, count) {
  const tierValues = { C: 25, R: 100, SR: 1500, SSR: 10000, UR: 25000 };
  return (tierValues[tier] || 0) * count;
}

function formatCardCollection(cardCounts, totalCards, isPremiumAccount) {
  const tiers = ['C', 'R', 'SR', 'SSR', 'UR'];
  let totalWorth = 0;

  tiers.forEach(tier => {
    totalWorth += calculateTierWorth(tier, cardCounts[tier] || 0);
  });

  let formattedCounts = tiers.map(tier => `${getTierEmoji(tier+"T")}: \`${cardCounts[tier] || 0}\``).join(' | ');

  if (isPremiumAccount) {
    totalWorth *= 2;
  }
  
  return `Total Cards: \`${totalCards}\`\n${formattedCounts}\nEstimated Worth (Burn Value):\n<:bloodstone:1315603629591498762> \`${totalWorth}\``;
}

function formatPremiumStatus(userData) {
  if (userData.isPremiumAccount) {
    const expirationDate = new Date(userData.premiumExpiresAt+"Z");
    const expirationTimestamp = Math.floor(expirationDate.getTime() / 1000);
    // console.log(`${userData.userId} | 👑 Premium (Expires <t:${expirationTimestamp}:R>)`);
    return `👑 Premium (Expires <t:${expirationTimestamp}:R>)`;
  }
  return 'Standard';
}

function calculateDaysSinceRegistered(registrationDate) {
  const now = new Date();
  const regDate = new Date(registrationDate+"Z");
  const diffTime = Math.abs(now - regDate);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}
