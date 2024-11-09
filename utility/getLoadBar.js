const loadBarEmojis = [
    '<:loadBar0:1300928505487294514>',
    '<:loadBar5:1300928503155261522>',
    '<:loadBar10:1300928515172208803>',
    '<:loadBar15:1300928511355392052>',
    '<:loadBar20:1300928508553461852>'
];

const getLoadBar = (percentage) => {
    percentage = Math.floor(percentage / 5) * 5;
    const fullBars = Math.floor(percentage / 20);
    const remainder = (percentage % 20) / 5;
    let loadBar = '';

    for (let i = 0; i < fullBars; i++) {
        loadBar += loadBarEmojis[4];
    }

    if (remainder > 0) {
        loadBar += loadBarEmojis[remainder];
    }

    const totalSegments = fullBars + (remainder > 0 ? 1 : 0);
    for (let i = totalSegments; i < 5; i++) {
        loadBar += loadBarEmojis[0];
    }

    return loadBar;
};

module.exports = getLoadBar;
