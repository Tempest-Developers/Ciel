const { PermissionsBitField } = require('discord.js');

module.exports = {
    checkPermissions: (channel, clientUser) => {
        const missingPermissions = channel.permissionsFor(clientUser).missing([PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]);
(['VIEW_CHANNEL', 'SEND_MESSAGES']);
        if (missingPermissions.length > 0) {
            // console.log(`Missing permissions in server ${channel.guild.id} (${channel.guild.name}) in channel ${channel.id} (${channel.name}): ${missingPermissions.join(', ')}`);
            return false;
        }
        return true;
    },

    checkIfGuildAllowed: async(client, guildID) => {
        // Check if server is allowed
        const serverSettings = await client.database.getServerSettings(guildID);

        // Check if server exists in the database
        if(serverSettings){
            if (!serverSettings.register) {
                // console.log(`Server ${guildID} is not allowed.`);
                return false;
            }else{
                return true;
            }
        }else{
            return false;
        }
    }
};
