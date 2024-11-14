const axios = require('axios');
const { API_URL, MAX_RETRIES, RETRY_DELAY, CARDS_PER_PAGE } = require('./constants');

const createAxiosConfig = () => ({
    headers: {
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
        'Host': 'api.mazoku.cc'
    }
});

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const retryOperation = async (operation, maxRetries = MAX_RETRIES) => {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await operation();
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            await delay(RETRY_DELAY * Math.pow(2, i));
        }
    }
};

const createBaseRequestBody = (page = 1) => ({
    page,
    pageSize: CARDS_PER_PAGE,
    name: "",
    type: "Card",
    seriesName: "",
    minVersion: 0,
    maxVersion: 1000,
    sortBy: "dateAdded",
    sortOrder: "desc"
});

const fetchCardDetails = async (cardId) => {
    try {
        const response = await retryOperation(() => 
            axios.get(`${API_URL}/get-card/${cardId}`, createAxiosConfig())
        );
        return response.data;
    } catch (error) {
        console.error(`Error fetching card ${cardId}:`, error);
        return null;
    }
};

const searchCards = async (searchParams, page = 1) => {
    const requestBody = createBaseRequestBody(page);

    if (searchParams.name) requestBody.name = searchParams.name;
    if (searchParams.anime) requestBody.seriesName = searchParams.anime;
    if (searchParams.tier) requestBody.tiers = [searchParams.tier];
    if (searchParams.sortBy && searchParams.sortBy !== 'wishlist') {
        requestBody.sortBy = searchParams.sortBy;
        requestBody.sortOrder = searchParams.sortOrder;
    }
    if (searchParams.type) requestBody.eventType = searchParams.type === 'event';

    const response = await retryOperation(() => 
        axios.post(`${API_URL}/get-cards`, requestBody)
    );

    return {
        cards: response.data.cards || [],
        totalPages: response.data.pageCount || 1
    };
};

module.exports = {
    createAxiosConfig,
    retryOperation,
    createBaseRequestBody,
    fetchCardDetails,
    searchCards
};
