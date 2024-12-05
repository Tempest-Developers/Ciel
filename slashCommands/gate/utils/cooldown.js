const { Collection } = require('discord.js');
const { LEAD_COOLDOWN, USER_COOLDOWN } = require('./constants');

const cooldowns = new Collection();

const handleCooldown = (userId, isLead, customCooldown = null) => {
    const cooldownTime = customCooldown || (isLead ? LEAD_COOLDOWN : USER_COOLDOWN);
    
    if (cooldowns.has(userId)) {
        const expirationTime = cooldowns.get(userId);
        const now = Date.now();
        
        if (now < expirationTime) {
            const timeLeft = (expirationTime - now) / 1000;
            return {
                onCooldown: true,
                timeLeft: timeLeft.toFixed(1)
            };
        }
    }

    cooldowns.set(userId, Date.now() + (cooldownTime * 1000));
    setTimeout(() => cooldowns.delete(userId), cooldownTime * 1000);

    return {
        onCooldown: false
    };
};

const applyCooldown = (userId, cooldownTime) => {
    cooldowns.set(userId, Date.now() + (cooldownTime * 1000));
    setTimeout(() => cooldowns.delete(userId), cooldownTime * 1000);
};

const checkCooldown = (userId) => {
    if (cooldowns.has(userId)) {
        const expirationTime = cooldowns.get(userId);
        const now = Date.now();
        
        if (now < expirationTime) {
            const timeLeft = (expirationTime - now) / 1000;
            return timeLeft.toFixed(1);
        }
    }
    return null;
};

module.exports = {
    handleCooldown,
    applyCooldown,
    checkCooldown
};
