module.exports = async (client, username) => {
    // Get all guilds the bot is a member of
    const guilds = client.guilds.cache;

    // Loop through each guild
    for (const guild of guilds.values()) {
        try {
        // Fetch all members of the guild
        const members = await guild.members.fetch();

        // Find the member with the matching username
        const member = members.find((member) => member.user.username === username);

        // If a member is found, return their ID
        if (member) {
            return member.id;
        }
        } catch (error) {
        console.error(`Error fetching members for guild ${guild.name}:`, error);
        }
    }

    // If no member is found, return null
    return null;
};