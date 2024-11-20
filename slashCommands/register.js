const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const mongo = require('../database/mongo');

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
    // Defer the reply immediately to get more time
    await interaction.deferReply({ ephemeral: true });
    
    const member = await interaction.guild.members.fetch(interaction.user.id);

    // Define the role names or IDs you want to check
    const adminRoleName = 'admin';
    const manageServerRoleName = 'manage server';

    // Define the required permissions
    const requiredPermissions = [PermissionsBitField.Flags.Administrator, PermissionsBitField.Flags.ManageGuild];

    // Check if the member has the required permissions
    const hasRequiredPermissions = requiredPermissions.some(permission => interaction.member.permissions.has(permission));

    console.log(hasRequiredPermissions, interaction.user.name)

    if (!hasRequiredPermissions) {
      return await interaction.editReply({
        embeds: [{
          title: 'Permission Denied',
          description: 'You need Admin or Manage Server permission to use this command.',
          color: 0xff0000,
        }]
      });
    }

    // Command logic
    const guildId = interaction.guild.id;
    const serverSettings = await mongo.getServerSettings(guildId);
    console.log(serverSettings)

    if (!serverSettings) {
      await mongo.createServerSettings(guildId);
      console.log("Created server settings");
      await mongo.toggleRegister(guildId);
      console.log("Next toggled register");
      
      await interaction.editReply({
        embeds: [{
          title: 'Server Registered',
          description: 'This server has been registered.',
          color: 0x00ff00,
        }]
      });
    } else if(!serverSettings.register){
      await mongo.toggleRegister(guildId);
      const updatedServerSettings = await mongo.getServerSettings(guildId);
      console.log("toggled register server settings");
      
      await interaction.editReply({
        embeds: [{
          title: `Guild Registered`,
          description: `This guild is successfully registered`,
          color: 0x00ff00 ,
        }]
      });
    } else {
      await interaction.editReply({
        embeds: [{
          title: `Guild Registered`,
          description: `This guild is successfully registered`,
          color: 0x00ff00 ,
        }]
      });
    }
  },
};
