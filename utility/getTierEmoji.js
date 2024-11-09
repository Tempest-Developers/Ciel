// utility/getTierEmoji.js (1-16)
module.exports = function getTierEmoji(tier) {
    let tierCase = tier.toUpperCase();
    switch (tierCase) {
        case 'CT':
            return '<:C_RR:1300917206657400882>';
        case 'RT':
            return '<:R_RR:1300917203750752307>';
        case 'SRT':
            return '<:SR_RR:1300917200885907466>';
        case 'SSRT':
            return '<:SSR_RR:1300917196918358046>';
        default:
            return ':game_die:';
    }
};