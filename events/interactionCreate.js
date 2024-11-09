const { Events } = require('discord.js');
const { checkPermissions, checkIfGuildAllowed } = require('../utility/auth');

const GATE_GUILD = '1240866080985976844';

module.exports = {
    name: Events.InteractionCreate,
    once: false,
    async execute(client, interaction) {
        // New permission check
        if (!checkPermissions(interaction.channel, interaction.client.user)) return;

        if((await checkIfGuildAllowed(client, interaction.guild.id)==false) && interaction.commandName!="registerguild") return;

        // Handle button interactions
        if (interaction.isButton()) {
            // Handle earn_tokens button
            if (interaction.customId === 'earn_tokens') {
                // Silently ignore if not in Gate Guild
                if (interaction.guild.id !== GATE_GUILD) {
                    return;
                }

                try {
                    const { mGateDB } = client.database;
                    let userData = await mGateDB.findOne({ userID: interaction.user.id });

                    if (!userData) {
                        await mGateDB.insertOne({
                            userID: interaction.user.id,
                            currency: [0, 0, 0, 0, 0],
                            tickets: [],
                            mission: [],
                            achievements: []
                        });
                        userData = await mGateDB.findOne({ userID: interaction.user.id });
                    }

                    // Generate random token reward (0-10)
                    const currentTokens = userData.currency[0];
                    let tokenReward;
                    const rand = Math.random() * 100;

                    if (rand < 20) { // 20% chance of 0 tokens
                        tokenReward = 0;
                    } else if (rand < 50) { // 30% chance of 1-3 tokens
                        tokenReward = Math.floor(Math.random() * 3) + 1;
                    } else if (rand < 75) { // 25% chance of 4-6 tokens
                        tokenReward = Math.floor(Math.random() * 3) + 4;
                    } else if (rand < 95) { // 20% chance of 7-9 tokens
                        tokenReward = Math.floor(Math.random() * 3) + 7;
                    } else { // 5% chance of 10 tokens
                        tokenReward = 10;
                    }

                    // Check max token limit
                    if (currentTokens + tokenReward > 25000) {
                        tokenReward = Math.max(0, 25000 - currentTokens);
                    }

                    if (tokenReward > 0) {
                        await mGateDB.updateOne(
                            { userID: interaction.user.id },
                            { $inc: { 'currency.0': tokenReward } }
                        );

                        return interaction.reply({
                            content: `🎉 You earned ${tokenReward} Slime Tokens! Your new balance is ${currentTokens + tokenReward} tokens.`,
                            ephemeral: true
                        });
                    } else {
                        return interaction.reply({
                            content: `😔 No tokens earned this time. Try again later!`,
                            ephemeral: true
                        });
                    }
                } catch (error) {
                    console.error('Error handling earn_tokens button:', error);
                }
                return;
            }

            // Handle other button interactions here
            const buttonHandler = interaction.client.buttons?.get(interaction.customId);
            if (buttonHandler) {
                try {
                    await buttonHandler.execute(interaction);
                } catch (error) {
                    console.error(`Error executing button ${interaction.customId}:`, error);
                }
            }
            return;
        }

        // Handle autocomplete interactions
        if (interaction.isAutocomplete()) {
            const command = interaction.client.slashCommands.get(interaction.commandName);
            if (!command || !command.autocomplete ) return;

            try {
                await command.autocomplete(interaction);
            } catch (error) {
                console.error(error);
            }
            return;
        }

        if (!interaction.isChatInputCommand()) return;

        const command = interaction.client.slashCommands.get(interaction.commandName);
        if (!command) return;

        const { developers } = interaction.client.config;
        const isDeveloper = developers.includes(interaction.user.id);

        // Check permissions
        if (command.developerOnly && !isDeveloper) {
            try {
                return await interaction.reply({ 
                    content: 'This command is only available to developers.', 
                    ephemeral: true 
                });
            } catch (error) {
                console.error('Failed to reply to permission check:', error);
                return;
            }
        }

        try {
            await command.execute(interaction, { database: interaction.client.database });
        } catch (error) {
            console.error('Command execution error:', error);
            
            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ 
                        content: 'There was an error while executing this command!', 
                        ephemeral: true 
                    });
                } else if (interaction.deferred) {
                    await interaction.editReply({
                        content: 'There was an error while executing this command!',
                    });
                }
            } catch (replyError) {
                console.error('Failed to send error message:', replyError);
            }
        }
    },
};
