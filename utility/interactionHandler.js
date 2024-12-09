const { InteractionType } = require('discord.js');

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

        // Ensure ephemeral property is preserved when editing
        if (type === 'editReply' && interaction.ephemeral) {
            options.ephemeral = true;
        }

        // Handle different response types
        switch (type) {
            case 'reply':
                if (!interaction.replied && !interaction.deferred) {
                    return await interaction.reply(options);
                } else if (interaction.deferred) {
                    return await interaction.editReply(options);
                }
                break;
            case 'editReply':
                if (interaction.deferred || interaction.replied) {
                    return await interaction.editReply(options);
                }
                break;
            case 'followUp':
                return await interaction.followUp(options);
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
async function handleCommandError(interaction, error, customMessage) {
    console.error('Command execution error:', {
        error,
        commandName: interaction.commandName,
        userId: interaction.user.id,
        guildId: interaction.guildId
    });

    let errorMessage = customMessage || 'An error occurred while processing your request.';

    if (error.message === "Mazoku Servers unavailable") {
        errorMessage = "Mazoku Servers are currently unavailable. Please try again later.";
    } else if (error.code === 'ECONNABORTED') {
        errorMessage = "The request timed out. Mazoku servers might be experiencing high load. Please try again in a few minutes.";
    }

    const responseOptions = {
        content: errorMessage,
        ephemeral: true
    };

    try {
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply(responseOptions);
        } else if (interaction.deferred) {
            await interaction.editReply(responseOptions);
        } else {
            await interaction.followUp(responseOptions);
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
            throw error; // Propagate the error for proper handling
        }
    }
}

module.exports = {
    handleInteraction,
    handleCommandError,
    safeDefer
};
