const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const getLoadBar = require('../utility/getLoadBar');
const getTierEmoji = require('../utility/getTierEmoji');
require('dotenv').config();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('View server stats for card claims'),

    async execute(interaction) {
        const { getServerData } = interaction.client.database;
        const guildId = interaction.guild.id;

        try {
            const serverData = await getServerData(guildId);
            if (!serverData || !serverData.claims || serverData.claims.length === 0) {
                return await interaction.reply({ content: 'No claims data found for this server!', ephemeral: true });
            }

            const existingClaims = serverData.claims;
            const existingCT = serverData.counts[0] || 0;
            const existingRT = serverData.counts[1] || 0;
            const existingSR = serverData.counts[2] || 0;
            const existingSSR = serverData.counts[3] || 0;

            const total = existingSSR + existingSR + existingRT + existingCT;

            const tiers = {
                SSR: { count: existingSSR, total },
                SR: { count: existingSR, total },
                R: { count: existingRT, total },
                C: { count: existingCT, total }
            };

            const embedField3 = existingClaims.slice(-5).map((claim) => {
                let content = `- ${getTierEmoji(claim.tier)} **${claim.cardName}** #**${claim.print}**`;
                return content;
            }).join('\n');

            const convertDateToUnix = (date_string) => {
                const date = new Date(date_string);
                return parseInt(date.getTime() / 1000);
            };

            const embedField4 = existingClaims.slice(-5).map((claim) => {
                const claimUnixTimestamp = convertDateToUnix(claim.timestamp);
                let content = `- **${claim.owner}** | <t:${claimUnixTimestamp}:R>`;
                return content;
            }).join('\n');

            let unixTimestamp = 1731133800;

            const statsEmbed = new EmbedBuilder()
                .setTitle(`${interaction.guild.name} Server Stats`)
                .setDescription(`Since <t:${unixTimestamp}:R>`)
                .addFields(
                    {
                        name: 'Tier Percentages',
                        value: `\n- ${getTierEmoji('SSRT')} ${getLoadBar((tiers.SSR.count / tiers.SSR.total) * 100)} **${(tiers.SSR.count / tiers.SSR.total * 100).toFixed(2)}**%\n- ${getTierEmoji('SRT')} ${getLoadBar((tiers.SR.count / tiers.SR.total) * 100)} **${(tiers.SR.count / tiers.SR.total * 100).toFixed(2)}**%\n- ${getTierEmoji('RT')} ${getLoadBar((tiers.R.count / tiers.R.total) * 100)} **${(tiers.R.count / tiers.R.total * 100).toFixed(2)}**%\n- ${getTierEmoji('CT')} **${getLoadBar((tiers.C.count / tiers.C.total) * 100)} ${(tiers.C.count / tiers.C.total * 100).toFixed(2)}**%\t`,
                        inline: true
                    },
                    {
                        name: 'Tier Counts',
                        value: `- ${getTierEmoji('SSRT')} **${tiers.SSR.count}**\n- ${getTierEmoji('SRT')} **${tiers.SR.count}**\n- ${getTierEmoji('RT')} **${tiers.R.count}**\n- ${getTierEmoji('CT')} **${tiers.C.count}**`,
                        inline: true
                    },
                    {
                        name: '\u200B',
                        value: '\u200B',
                        inline: true
                    },
                    {
                        name: 'Recent Claims',
                        value: embedField3 || 'No recent claims',
                        inline: true
                    },
                    {
                        name: 'Owners and Timestamps',
                        value: embedField4 || 'No recent claims',
                        inline: true
                    }
                );

            await interaction.reply({ embeds: [statsEmbed], ephemeral: true });

        } catch (error) {
            console.error('Error executing stats command:', error);
            await interaction.reply({ content: 'An error occurred while fetching stats!', ephemeral: true });
        }
    },
};
