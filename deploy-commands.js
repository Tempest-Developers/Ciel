const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const commands = [];
const slashCommandsPath = path.join(__dirname, 'slashCommands');
const commandFiles = fs.readdirSync(slashCommandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const command = require(path.join(slashCommandsPath, file));
    commands.push(command.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN_TEST);
const isGlobal = process.env.IS_GLOBAL === 'true';
const isAdd = process.env.IS_ADD === 'true';
const guildId = process.env.GUILD_ID;

(async () => {
    try {
        console.log('Started refreshing application (/) commands.');

        if (isAdd) {
            if (isGlobal) {
                await rest.put(
                    Routes.applicationCommands(process.env.CLIENT_ID),
                    { body: commands },
                );
                console.log('Successfully reloaded global application (/) commands.');
            } else {
                await rest.put(
                    Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
                    { body: commands },
                );
                console.log(`Successfully reloaded guild application (/) commands for guild ${guildId}.`);
            }
        } else {
            if (isGlobal) {
                await rest.put(
                    Routes.applicationCommands(process.env.CLIENT_ID),
                    { body: [] },
                );
                console.log('Successfully removed global application (/) commands.');
            } else {
                await rest.put(
                    Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
                    { body: [] },
                );
                console.log(`Successfully removed guild application (/) commands for guild ${guildId}.`);
            }
        }
    } catch (error) {
        console.error(error);
    }
})();
