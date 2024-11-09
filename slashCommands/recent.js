const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
require('dotenv').config();

const getTierEmoji = require('../utility/getTierEmoji');

const cooldowns = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('recent')
    .setDescription('Displays last 15 claims with tier filtering'),
  developerOnly: false,
  adminOnly: false,
  async execute(interaction, { database }) {
    try {
      await interaction.deferReply();

      // Cooldown check
      const { user } = interaction;
      const cooldownTime = 60000; // 1 minute in milliseconds
      
      if (!cooldowns.has(interaction.guild.id)) {
        cooldowns.set(interaction.guild.id, new Map());
      }
      
      const guildCooldowns = cooldowns.get(interaction.guild.id);
      
      if (guildCooldowns.has(user.id)) {
        const expirationTime = guildCooldowns.get(user.id) + cooldownTime;
        if (Date.now() < expirationTime) {
          const timeLeft = Math.ceil((expirationTime - Date.now()) / 1000);
          return await interaction.editReply({ 
            content: `Please wait <t:${timeLeft}:R> before using this command again.`,
            ephemeral: true 
          });
        }
      }
      
      guildCooldowns.set(user.id, Date.now());
      1007582286092443698
      const serverData = await database.getServerData(interaction.guild.id);

      if (!serverData?.claims) {
        return await interaction.editReply({ 
          content: 'No claims found for this server.', 
          ephemeral: true 
        });
      }

      function getAllClaims(claims) {
        // Combine all tier arrays and sort by timestamp
        return Object.entries(claims)
          .filter(([tier]) => ['CT', 'RT', 'SRT', 'SSRT'].includes(tier))
          .map(([_, claims]) => claims)
          .flat()
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      }

      function getClaimsForTier(claims, tier) {
        if (tier === 'ALL') {
          return getAllClaims(claims);
        }
        return claims[tier] || [];
      }

      function createEmbed(claims, selectedTier) {
        const tierDisplay = selectedTier === 'ALL' ? 'All Tiers' : selectedTier;
        const embed = new EmbedBuilder()
          .setTitle(`Last 15 Claims ${getTierEmoji(tierDisplay)}`)
          .setAuthor({ 
            name: `Recent Claims (Including Summons)`, 
            iconURL: interaction.guild.iconURL() 
          })
          .setColor('#FFC0CB')
          .setFooter({ text: interaction.guild.name });

        if (claims.length === 0) {
          embed.setDescription('No claims recorded for this tier');
        } else {
          const description = claims.slice(0, 15).map(claim => {
            const unixTime = Math.floor(new Date(claim.timestamp).getTime() / 1000);
            const ownerName = claim.owner || 'Unknown Owner';
            return `${getTierEmoji(claim.tier)} #**${claim.print}** • **${claim.cardName}** \t • <t:${unixTime}:R> \t • *${ownerName}*`;
          }).join('\n');
          embed.setDescription(description);
        }

        return embed;
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

      const initialClaims = getAllClaims(serverData.claims);
      const initialEmbed = createEmbed(initialClaims, 'ALL');
      const response = await interaction.editReply({ 
        embeds: [initialEmbed], 
        components: [row],
        fetchReply: true 
      });

      const collector = response.createMessageComponentCollector({ 
        time: 60000 // Collector active for 1 minute
      });

      collector.on('collect', async i => {
        try {
          if (i.user.id === interaction.user.id) {
            const selectedTier = i.values[0];
            const filteredClaims = getClaimsForTier(serverData.claims, selectedTier);
            const newEmbed = createEmbed(filteredClaims, selectedTier);
            await i.update({ embeds: [newEmbed], components: [row] });
          } else {
            await i.reply({ 
              content: 'Only the command user can use this menu.', 
              ephemeral: true 
            });
          }
        } catch (error) {
          console.error('Error in collector:', error);
          try {
            await i.reply({ 
              content: 'An error occurred while updating the display.',
              ephemeral: true 
            });
          } catch (replyError) {
            console.error('Error sending error message:', replyError);
          }
        }
      });

      collector.on('end', async () => {
        try {
          await response.edit({ components: [] });
        } catch (error) {
          console.error('Error removing components:', error);
        }
      });

    } catch (error) {
      console.error('Command execution error:', error);
      try {
        const reply = interaction.deferred ? interaction.editReply : interaction.reply;
        await reply.call(interaction, { 
          content: 'An error occurred while executing this command.',
          ephemeral: true 
        });
      } catch (replyError) {
        console.error('Error sending error message:', replyError);
      }
    }
  }
};
