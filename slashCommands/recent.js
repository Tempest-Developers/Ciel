const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
require('dotenv').config();

const { getTierEmoji } = require('../utility/getTierEmoji');

const cooldowns = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('recent')
    .setDescription('Displays last 15 claims with tier filtering'),
  developerOnly: false,
  adminOnly: false,
  async execute(interaction, { database }) {
    try {
      // Check if server is allowed
      // if (!interaction.client.config.serverAllowed.includes(interaction.guild.id)) {
      //   return await interaction.reply({ 
      //     content: 'This command is not available in this server.',
      //     ephemeral: true 
      //   });
      // }

      // Defer the reply immediately to prevent timeout
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
      
      // When setting the cooldown, use the guild ID and user ID
      guildCooldowns.set(user.id, Date.now());

      const serverData = await database.getServerData(interaction.guild.id);
      // const serverData = await database.getServerData(process.env.GATE_GUILD);

      if (!serverData?.claims) {
        return await interaction.editReply({ 
          content: 'No claims found for this server.', 
          ephemeral: true 
        });
      }

      let allClaims = serverData.claims;

      // Parse claims if they're stored as a string
      if (typeof allClaims === 'string') {
        try {
          allClaims = JSON.parse(allClaims);
        } catch (error) {
          console.error('Error parsing claims:', error);
          return await interaction.editReply({ 
            content: 'Error parsing claims data. Please contact an administrator.',
            ephemeral: true 
          });
        }
      }

      if (!Array.isArray(allClaims)) {
        console.error('Claims is not an array:', typeof allClaims);
        return await interaction.editReply({ 
          content: 'Invalid claims data format. Please contact an administrator.',
          ephemeral: true 
        });
      }

      // Sort claims by timestamp
      allClaims.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

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

      const initialEmbed = createEmbed(allClaims.slice(0, 15), 'ALL');
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
