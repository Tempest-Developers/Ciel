const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
require('dotenv').config();

const cooldowns = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('recent')
    .setDescription('Displays last 15 claims with tier filtering'),
  developerOnly: false, // Make this command developer-only
  adminOnly: false,
  async execute(interaction, { database }) {
    // Cooldown check
    const { user } = interaction;
    const cooldownTime = 60000; // 1 minute in milliseconds
    
    if (cooldowns.has(user.id)) {
        const expirationTime = cooldowns.get(user.id) + cooldownTime;
        if (Date.now() < expirationTime) {
            const timeLeft = Math.floor(expirationTime / 1000); // Convert to seconds
            return interaction.reply({ 
                content: `Please wait <t:${timeLeft}:R> before using this command again.`, 
                ephemeral: true 
            });
        }
    }
    
    cooldowns.set(user.id, Date.now());

    // const GUILD_ID = process.env.Gate_GUILD;
    const serverData = await database.getServerData(interaction.guild.id);
    // const serverData = await database.getServerData(`1270793006856929373`);

    if (!serverData?.claims) {
      return interaction.reply({ content: 'No claims found.', ephemeral: true });
    }

    const allClaims = serverData.claims;

    if (typeof allClaims === 'string') {
      try {
        allClaims = JSON.parse(allClaims);
      } catch (error) {
        console.error('Error parsing claims:', error);
        return interaction.reply({ content: 'Error parsing claims.', ephemeral: true });
      }
    }

    if (!Array.isArray(allClaims)) {
      console.error('Claims is not an array.');
      return interaction.reply({ content: 'Claims is not an array.', ephemeral: true });
    }

    allClaims.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));


    function getTierEmoji(tier) {
      const emojis = {
        'ct': '<:C_Gate:1300919916685164706>',
        'rt': '<:R_Gate:1300919898209386506>',
        'srt': '<:SR_Gate:1300919875757146214>',
        'ssrt': '<:SSR_Gate:1300919858053124163>'
      };
      return emojis[tier.toLowerCase()] || ':game_die:';
    }

    function createEmbed(claims, selectedTier) {
      const tierDisplay = selectedTier === 'ALL' ? 'All Tiers' : selectedTier;
      return new EmbedBuilder()
        .setTitle(`Last 15 Claims ${getTierEmoji(tierDisplay)}`)
        .setAuthor({ name: `Recent Claims ( Including Summons )`, iconURL: interaction.guild.iconURL() })
        .setColor('#FFC0CB')
        .setDescription(
          claims.length > 0 
            ? claims.map(claim => {
                const unixTime = Math.floor(new Date(claim.timestamp).getTime() / 1000);
                const seriesName = claim.fieldName.split(' ')[2] || 'Unknown Series';
                return `${getTierEmoji(claim.tier)} #**${claim.print}** • **${claim.cardName}** \t • <t:${unixTime}:R> \t • *${seriesName}*`;
              }).join('\n')
            : 'No claims recorded for this tier'
        )
        .setFooter({ text: `${interaction.guild.name}` });
    }

    const row = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('tier-filter')
          .setPlaceholder('Select a tier to filter')
          .addOptions([
            { label: 'All Tiers', value: 'ALL' },
            { label: 'C Tier', value: 'CT' },
            { label: 'R Tier', value: 'RT' },
            { label: 'SR Tier', value: 'SRT' },
            { label: 'SSR Tier', value: 'SSRT' }
          ])
      );

    const initialEmbed = createEmbed(allClaims.slice(0, 15), 'ALL');
    const response = await interaction.reply({ 
      embeds: [initialEmbed], 
      components: [row],
      fetchReply: true 
    });

    const collector = response.createMessageComponentCollector({ 
      time: 600000 // Collector active for 1 minute
    });

    collector.on('collect', async i => {
      if (i.user.id === interaction.user.id) {
        const selectedTier = i.values[0];
        const filteredClaims = selectedTier === 'ALL' 
          ? allClaims 
          : allClaims.filter(claim => claim.tier.toLowerCase() === selectedTier.toLowerCase());
        
        const newEmbed = createEmbed(filteredClaims.slice(0, 15), selectedTier);
        await i.update({ embeds: [newEmbed], components: [row] });
      } else {
        await i.reply({ 
          content: 'Only the command user can use this menu.', 
          ephemeral: true 
        });
      }
    });

    collector.on('end', () => {
      response.edit({ components: [] }).catch(console.error);
    });
  }
};
