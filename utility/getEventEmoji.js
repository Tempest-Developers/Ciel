/**
 * Returns the emoji for a given event type
 * @param {string} eventType - The type of event
 * @returns {string} The corresponding emoji or an empty string
 */
const getEventEmoji = (eventType) => {
    const eventEmojis = {
        'christmas': '🎄',
        'halloween': '🎃'
    };
    console.log(eventEmojis[eventType.toLowerCase()] || ``)
    return eventEmojis[eventType.toLowerCase()] || '';
};

module.exports = getEventEmoji;
