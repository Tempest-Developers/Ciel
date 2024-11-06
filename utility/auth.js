module.exports = {
    isServerAllowed: (client,guildId) => {
        return client.config.serverAllowed.includes(guildId);
    }
    
}