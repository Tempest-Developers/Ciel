const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const getTierEmoji = require('../utility/getTierEmoji');
const getLoadBar = require('../utility/getLoadBar');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('Shows server or user stats')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User to check stats for')
                .setRequired(false)
        ),
    async execute(interaction, { database }) {
        try {
            await interaction.deferReply();

            const targetUser = interaction.options.getUser('user') || interaction.user;
            const guildId = interaction.guild.id;

            // Get server settings to check if stats are allowed
            const serverSettings = await database.getServerSettings(guildId);
            if (!serverSettings?.settings?.allowShowStats) {
                return await interaction.editReply({
                    content: 'Stats are currently disabled in this server.',
                    ephemeral: true
                });
            }

            // Get user data
            const userData = await database.getPlayerData(targetUser.id, guildId);
            if (!userData) {
                return await interaction.editReply({
                    content: 'No data found for this user.',
                    ephemeral: true
                });
            }

            // Calculate total claims per tier
            const tierCounts = {
                CT: userData.claims.CT?.length || 0,
                RT: userData.claims.RT?.length || 0,
                SRT: userData.claims.SRT?.length || 0,
                SSRT: userData.claims.SSRT?.length || 0
            };

            // Calculate total claims
            const totalClaims = Object.values(tierCounts).reduce((a, b) => a + b, 0);

            // Create stats embed
            const embed = new EmbedBuilder()
                .setColor('#FFC0CB')
                .setTitle(`${targetUser.username}'s Stats`)
                .setThumbnail(targetUser.displayAvatarURL())
                .addFields(
                    { 
                        name: 'Total Claims', 
                        value: totalClaims.toString(), 
                        inline: true 
                    },
                    { 
                        name: '\u200B', 
                        value: '\u200B', 
                        inline: true 
                    },
                    { 
                        name: 'Server', 
                        value: interaction.guild.name, 
                        inline: true 
                    }
                )
                .addFields(
                    {
                        name: 'Claims by Tier',
                        value: Object.entries(tierCounts)
                            .map(([tier, count]) => {
                                const percentage = totalClaims > 0 ? (count / totalClaims) * 100 : 0;
                                return `${getTierEmoji(tier)} ${count} (${percentage.toFixed(1)}%) ${getLoadBar(percentage)}`;
                            })
                            .join('\n')
                    }
                )
                .setFooter({ 
                    text: `Stats as of <t:1731133800:R>` 
                });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in stats command:', error);
            await interaction.editReply({
                content: 'An error occurred while fetching stats.',
                ephemeral: true
            });
        }
    },
};
