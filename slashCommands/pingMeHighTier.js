const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('hightiertole')
        .setDescription('Toggle whether you receive High Tier card notifications'),

    async execute(interaction) {
        return await interaction.reply({
            content: 'Command unavailable for this server.',
            ephemeral: true
        });

        try {
            const guildId = interaction.guild.id;
            const member = interaction.member;

            // Check if feature is enabled for this server
            const serverData = await interaction.client.database.serverSettings.findOne({ serverID: guildId });
            if (!serverData?.settings?.allowRolePing) {
                return await interaction.reply({
                    content: 'High Tier role ping feature is not enabled on this server.',
                    ephemeral: true
                });
            }

            // Get or create the HighTier role
            let highTierRole = interaction.guild.roles.cache.find(role => role.name === 'HighTier');
            
            if (!highTierRole) {
                try {
                    highTierRole = await interaction.guild.roles.create({
                        name: 'HighTier',
                        reason: 'Created for High Tier card notifications'
                    });
                } catch (error) {
                    console.error('Error creating HighTier role:', error);
                    let errorMessage = 'Unable to create HighTier role. ';
                    if (error.code === 50013) {
                        errorMessage += 'The bot lacks necessary permissions. Please ensure it has the "Manage Roles" permission.';
                    } else if (error.code === 50028) {
                        errorMessage += 'The bot\'s role must be higher than the HighTier role position.';
                    } else {
                        errorMessage += 'Please check bot permissions and role hierarchy.';
                    }
                    return await interaction.reply({
                        content: errorMessage,
                        ephemeral: true
                    });
                }
            }

            try {
                if (member.roles.cache.has(highTierRole.id)) {
                    await member.roles.remove(highTierRole);
                    await interaction.reply({
                        content: 'You will no longer receive High Tier card notifications.',
                        ephemeral: true
                    });
                } else {
                    await member.roles.add(highTierRole);
                    await interaction.reply({
                        content: 'You will now receive High Tier card notifications!',
                        ephemeral: true
                    });
                }
            } catch (error) {
                console.error('Error managing user role:', error);
                let errorMessage = 'Unable to modify your roles. ';
                if (error.code === 50013) {
                    errorMessage += 'The bot lacks necessary permissions to manage roles.';
                } else if (error.code === 50028) {
                    errorMessage += 'The bot\'s role must be higher than the HighTier role.';
                } else {
                    errorMessage += 'Please check bot permissions and role hierarchy.';
                }
                await interaction.reply({
                    content: errorMessage,
                    ephemeral: true
                });
            }

        } catch (error) {
            console.error('Error in hightiertole command:', error);
            await interaction.reply({
                content: 'There was an error while executing this command.',
                ephemeral: true
            });
        }
    },
};
