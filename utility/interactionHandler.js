/**
 * Utility functions for handling Discord interactions safely
 */

/**
 * Safely handle interaction responses with timeout checks
 * @param {Discord.CommandInteraction} interaction The interaction to handle
 * @param {Object} options Response options (content, embeds, components, etc.)
 * @param {String} type The type of response ('reply', 'editReply', or 'followUp')
 * @returns {Promise<Discord.Message|void>} The response message or void if failed
 */
async function handleInteraction(interaction, options, type = 'reply') {
    try {
        // Check if interaction is still valid
        if (!interaction.isRepliable()) {
            console.warn('Interaction is no longer valid');
            return;
        }

        // Handle different response types
        switch (type) {
            case 'reply':
                if (!interaction.replied && !interaction.deferred) {
                    return await interaction.reply(options);
                }
                break;
            case 'editReply':
                if (interaction.deferred || interaction.replied) {
                    return await interaction.editReply(options);
                }
                break;
            case 'followUp':
                if (interaction.replied) {
                    return await interaction.followUp(options);
                }
                break;
            default:
                throw new Error(`Invalid interaction response type: ${type}`);
        }
    } catch (error) {
        if (error.code === 10062) {
            console.warn('Interaction expired:', {
                commandName: interaction.commandName,
                userId: interaction.user.id,
                guildId: interaction.guildId
            });
        } else {
            console.error('Error handling interaction:', {
                error,
                commandName: interaction.commandName,
                type,
                interactionStatus: {
                    replied: interaction.replied,
                    deferred: interaction.deferred
                }
            });
        }
    }
}

/**
 * Handle errors during command execution
 * @param {Discord.CommandInteraction} interaction The interaction that errored
 * @param {Error} error The error that occurred
 * @param {String} customMessage Optional custom error message
 */
async function handleCommandError(interaction, error, customMessage = 'An error occurred while processing your request.') {
    console.error('Command execution error:', {
        error,
        commandName: interaction.commandName,
        userId: interaction.user.id,
        guildId: interaction.guildId
    });

    const errorMessage = {
        content: customMessage,
        ephemeral: true
    };

    try {
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply(errorMessage);
        } else if (interaction.deferred) {
            await interaction.editReply(errorMessage);
        } else {
            await interaction.followUp(errorMessage);
        }
    } catch (replyError) {
        if (replyError.code === 10062) {
            console.warn('Interaction expired while trying to send error message');
        } else {
            console.error('Failed to send error message:', replyError);
        }
    }
}

/**
 * Defer an interaction with proper error handling
 * @param {Discord.CommandInteraction} interaction The interaction to defer
 * @param {Object} options Defer options (ephemeral, etc.)
 */
async function safeDefer(interaction, options = {}) {
    try {
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply(options);
        }
    } catch (error) {
        if (error.code === 10062) {
            console.warn('Interaction expired while trying to defer');
        } else {
            console.error('Error deferring interaction:', error);
        }
    }
}

module.exports = {
    handleInteraction,
    handleCommandError,
    safeDefer
};
