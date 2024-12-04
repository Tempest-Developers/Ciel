const { Collection } = require('discord.js');

class RateLimiter {
    constructor() {
        this.requests = new Collection();
        this.maxRequests = 50; // Adjust based on your bot's verified status and needs
        this.interval = 1000; // 1 second
    }

    async rateLimit(key) {
        const now = Date.now();
        const requests = this.requests.get(key) || [];
        const validRequests = requests.filter(time => now - time < this.interval);

        if (validRequests.length >= this.maxRequests) {
            const oldestRequest = validRequests[0];
            const timeToWait = this.interval - (now - oldestRequest);
            await new Promise(resolve => setTimeout(resolve, timeToWait));
            return this.rateLimit(key);
        }

        validRequests.push(now);
        this.requests.set(key, validRequests);
        return true;
    }
}

module.exports = new RateLimiter();
