const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { handleInteraction, handleCommandError, safeDefer } = require('../utility/interactionHandler');
const getTierEmoji = require('../utility/getTierEmoji');
require('dotenv').config();

const cooldowns = new Map();
const COOLDOWN_DURATION = 5000; // 5 seconds

module.exports = {
  data: new SlashCommandBuilder()
    .setName('recent')
    .setDescription('Displays last 15 claims with tier filtering'),
  developerOnly: false,
  adminOnly: false,
  async execute(interaction, { database }) {
    try {
      // Cooldown check
      const { user } = interaction;
      const guildId = interaction.guild.id;
      
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
      
      guildCooldowns.set(user.id, Date.now());
      
      await safeDefer(interaction);
      
      const serverData = await database.getServerData(interaction.guild.id);

      if (!serverData?.claims) {
        return await handleInteraction(interaction, { 
          content: 'No claims found for this server.', 
          ephemeral: true 
        }, 'editReply');
      }

      function getAllClaims(claims) {
        // Combine all tier arrays and ensure sorting by newest first
        return Object.entries(claims)
          .filter(([tier]) => ['CT', 'RT', 'SRT', 'SSRT'].includes(tier))
          .map(([_, claims]) => claims)
          .flat()
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)); // Newest first
      }

      function getClaimsForTier(claims, tier) {
        if (tier === 'ALL') {
          return getAllClaims(claims);
        }
        // Ensure tier-specific claims are also sorted newest first
        return (claims[tier] || []).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      }

      function createEmbed(claims, selectedTier) {
        const tierDisplay = selectedTier === 'ALL' ? 'All Tiers' : selectedTier;
        const embed = new EmbedBuilder()
          .setTitle(`Last 15 Claims ${getTierEmoji(tierDisplay)}`)
          .setAuthor({ 
            name: `Recent Claims (Auto Summons)`, 
            iconURL: interaction.guild.iconURL() 
          })
          .setColor('#FFC0CB')
          .setFooter({ text: interaction.guild.name });

        if (claims.length === 0) {
          embed.setDescription('No claims recorded for this tier');
        } else {
          // Take first 15 claims (already sorted newest first) and map them to display strings
          const description = claims
            .slice(0, 15)
            .map((claim, index) => {
              const unixTime = Math.floor(new Date(claim.timestamp).getTime() / 1000);
              const ownerName = claim.owner || 'Unknown Owner';
              // Add index+1 to show clear ordering from top to bottom
              return `${getTierEmoji(claim.tier)} <t:${unixTime}:R> • #*${claim.print}* • **${claim.cardName}** • *${ownerName}*`;
            })
            .join('\n');
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
      const response = await handleInteraction(interaction, { 
        embeds: [initialEmbed], 
        components: [row],
        fetchReply: true 
      }, 'editReply');

      const collector = response.createMessageComponentCollector({ 
        time: 600000 // Collector active for 10 minutes
      });

      collector.on('collect', async i => {
        try {
          if (i.user.id === interaction.user.id) {
            await i.deferUpdate();
            
            const selectedTier = i.values[0];
            const filteredClaims = getClaimsForTier(serverData.claims, selectedTier);
            const newEmbed = createEmbed(filteredClaims, selectedTier);
            
            await i.editReply({ 
              embeds: [newEmbed], 
              components: [row] 
            });
          } else {
            await handleInteraction(i, { 
              content: 'Only the command user can use this menu.', 
              ephemeral: true 
            }, 'reply');
          }
        } catch (error) {
          await handleCommandError(i, error, 'An error occurred while updating the display.');
        }
      });

      collector.on('end', async () => {
        try {
          // Check if the message still exists and is fetchable
          const message = await interaction.channel.messages.fetch(response.id).catch(() => null);
          if (message) {
            await message.edit({ components: [] }).catch(() => {
              // Silently fail if we can't edit the message
              console.log('Could not remove components from message - it may have been deleted');
            });
          }
        } catch (error) {
          // Silently handle any errors during component removal
          console.log('Error in collector end event:', error);
        }
      });

    } catch (error) {
      await handleCommandError(interaction, error, 'An error occurred while executing this command.');
    }
  }
};
