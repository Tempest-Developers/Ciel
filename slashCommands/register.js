const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const mongo = require('../database/mongo');
const { handleInteraction, handleCommandError, safeDefer } = require('../utility/interactionHandler');

// Define the command
const command = new SlashCommandBuilder()
  .setName('register')
  .setDescription('Register server');

// Export the command
module.exports = {
  data: command,
  developerOnly: false,
  adminOnly: false,
  async execute(interaction) {
    try {
        // Defer the reply immediately to get more time
        await safeDefer(interaction, { ephemeral: true });
        
        const member = await interaction.guild.members.fetch(interaction.user.id);

        // Define the role names or IDs you want to check
        const adminRoleName = 'admin';
        const manageServerRoleName = 'manage server';

        // Define the required permissions
        const requiredPermissions = [PermissionsBitField.Flags.Administrator, PermissionsBitField.Flags.ManageGuild];

        // Check if the member has the required permissions
        const hasRequiredPermissions = requiredPermissions.some(permission => interaction.member.permissions.has(permission));

        if (!hasRequiredPermissions) {
            return await handleInteraction(interaction, {
                embeds: [{
                    title: 'Permission Denied',
                    description: 'You need Admin or Manage Server permission to use this command.',
                    color: 0xff0000,
                }]
            }, 'editReply');
        }

        // Command logic
        const guildId = interaction.guild.id;
        const serverSettings = await mongo.getServerSettings(guildId);

        if (!serverSettings) {
            await mongo.createServerSettings(guildId);
            await mongo.toggleRegister(guildId);
            
            return await handleInteraction(interaction, {
                embeds: [{
                    title: 'Server Registered',
                    description: 'This server has been registered.',
                    color: 0x00ff00,
                }]
            }, 'editReply');
        } else if(!serverSettings.register) {
            await mongo.toggleRegister(guildId);
            
            return await handleInteraction(interaction, {
                embeds: [{
                    title: `Guild Registered`,
                    description: `This guild is successfully registered`,
                    color: 0x00ff00,
                }]
            }, 'editReply');
        } else {
            return await handleInteraction(interaction, {
                embeds: [{
                    title: `Guild Registered`,
                    description: `This guild is successfully registered`,
                    color: 0x00ff00,
                }]
            }, 'editReply');
        }
    } catch (error) {
        await handleCommandError(interaction, error, 'An error occurred while registering the server.');
    }
  },
};
