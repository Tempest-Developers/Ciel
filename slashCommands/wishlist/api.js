const axios = require('axios');
const { API_URL, MAX_RETRIES, RETRY_DELAY, CARDS_PER_PAGE } = require('./constants');

// Function to handle Mazoku API errors
const handleMazokuAPICall = async (apiCall) => {
    try {
        const response = await apiCall();
        return response;
    } catch (error) {
        console.error('Mazoku API Error:', error);
        if (error.response) {
            const status = error.response.status;
            if (status === 400 || status === 404 || status === 500) {
                throw new Error("The Mazoku Servers are currently unavailable. Please try again later.");
            }
        }
        throw error;
    }
};

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
            const result = await handleMazokuAPICall(operation);
            return result;
        } catch (error) {
            if (error.message === "The Mazoku Servers are currently unavailable. Please try again later.") {
                throw error;
            }
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
        
        if (!response.data) {
            return {
                name: '*Data Unavailable*',
                series: '*Data Unavailable*',
                tier: 'Unknown',
                makers: []
            };
        }

        // Add fallbacks for missing data
        return {
            ...response.data,
            name: response.data.name || '*Data Unavailable*',
            series: response.data.series || '*Data Unavailable*',
            makers: response.data.makers || []
        };
    } catch (error) {
        if (error.message === "The Mazoku Servers are currently unavailable. Please try again later.") {
            throw error;
        }
        console.error(`Error fetching card ${cardId}:`, error);
        return {
            name: '*Data Unavailable*',
            series: '*Data Unavailable*',
            tier: 'Unknown',
            makers: []
        };
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

        // Process each card to ensure data availability
        const cards = (response.data.cards || []).map(card => ({
            ...card,
            name: card.name || '*Data Unavailable*',
            series: card.series || '*Data Unavailable*',
            makers: card.makers || []
        }));

        return {
            cards,
            totalPages: response.data.pageCount || 1
        };
    } catch (error) {
        if (error.message === "The Mazoku Servers are currently unavailable. Please try again later.") {
            throw error;
        }
        console.error('Error searching cards:', error);
        throw new Error('Failed to fetch cards. Please try again.');
    }
};

module.exports = {
    createAxiosConfig,
    retryOperation,
    createBaseRequestBody,
    fetchCardDetails,
    searchCards
};
