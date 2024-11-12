module.exports = {
    name: 'guildlist',
    description: 'List all guild names and IDs',
    developerOnly: true, // Make this command developer-only
    adminOnly: false, // Make this command admin-only
    async execute(message, args) {
        console.log("HERE guildList")
        const guilds = message.client.guilds.cache.map(guild => ({
            name: guild.name,
            id: guild.id
        }));

        const guildList = guilds.map(guild => `Name: ${guild.name}, ID: ${guild.id}`).join('\n');
        await message.reply(`Guild List:\n${guildList}`);
    },
};
