const axios = require('axios');

const API_BASE_URL = 'https://api.mazoku.cc/api';

async function getCardById(cardId) {
    try {
        const response = await axios.get(`${API_BASE_URL}/get-inventory-items-by-card/${cardId}`);
        // Return the first item's card data since all items for same card ID have same card info
        return response.data[0]?.card || null;
    } catch (error) {
        console.error('Error fetching card data:', error.response?.data || error.message);
        return null;
    }
}

async function enrichClaimWithCardData(claim) {
    try {
        const cardData = await getCardById(claim.cardID);
        if (cardData) {
            return {
                ...claim,
                card: {
                    ...claim.card,
                    series: cardData.series,
                    cardImageLink: cardData.cardImageLink,
                    makers: cardData.makers,
                    type: cardData.type
                }
            };
        }
        return claim;
    } catch (error) {
        console.error('Error enriching claim data:', error.response?.data || error.message);
        return claim;
    }
}

module.exports = {
    getCardById,
    enrichClaimWithCardData
};
