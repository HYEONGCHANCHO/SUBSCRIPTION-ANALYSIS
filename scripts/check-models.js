const axios = require('axios');
require('dotenv').config();

async function findMyModels() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'YOUR_API_KEY_HERE') {
        console.error('Error: Please set your actual API key in .env');
        return;
    }
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    
    try {
        console.log('--- Checking available models for your API Key ---');
        const response = await axios.get(url);
        const models = response.data.models;
        if (!models || models.length === 0) {
            console.log('No models found for this API key.');
            return;
        }
        models.forEach(m => {
            if (m.supportedGenerationMethods.includes('generateContent')) {
                console.log(`- ${m.name}`);
            }
        });
        console.log('--- End of list ---');
    } catch (e) {
        const msg = e.response?.data?.error?.message || e.message;
        console.error('Failed to list models:', msg);
    }
}

findMyModels();