module.exports = {
    checkPermissions: (channel, clientUser) => {
        const missingPermissions = channel.permissionsFor(clientUser).missing(['VIEW_CHANNEL', 'SEND_MESSAGES']);
        if (missingPermissions.length > 0) {
            console.log(`Missing permissions in server ${channel.guild.id} (${channel.guild.name}) in channel ${channel.id} (${channel.name}): ${missingPermissions.join(', ')}`);
            return false;
        }
        return true;
    }
};
