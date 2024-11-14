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
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            if (i === maxRetries - 1) break;
            await delay(RETRY_DELAY * Math.pow(2, i));
        }
    }
    throw lastError;
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
    try {
        const requestBody = {
            ...createBaseRequestBody(page),
            name: searchParams.name || "",
            seriesName: searchParams.anime || "",
            sortBy: searchParams.sortBy || "dateAdded",
            sortOrder: searchParams.sortOrder || "desc"
        };

        if (searchParams.tier) {
            requestBody.tiers = [searchParams.tier];
        }

        if (searchParams.type) {
            requestBody.eventType = searchParams.type === 'event';
        }

        const response = await retryOperation(() => 
            axios.post(`${API_URL}/get-cards`, requestBody, createAxiosConfig())
        );

        return {
            cards: response.data.cards || [],
            totalPages: response.data.pageCount || 1
        };
    } catch (error) {
        console.error('Error searching cards:', error);
        throw error;
    }
};

module.exports = {
    createAxiosConfig,
    retryOperation,
    createBaseRequestBody,
    fetchCardDetails,
    searchCards
};