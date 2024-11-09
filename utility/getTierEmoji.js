module.exports = function getTierEmoji(tier) {
    console.log("Utility Tier Emoji "+tier)
    let tierCase = tier.toUpperCase();
    switch (tierCase) {
        case 'CT':
            return '<:C_Gate:1300919916685164706>';
        case 'RT':
            return '<:R_Gate:1300919898209386506>';
        case 'SRT':
            return '<:SR_Gate:1300919875757146214>';
        case 'SSRT':
            return '<:SSR_Gate:1300919858053124163>';
        default:
            return ':game_die:';
    }
};
