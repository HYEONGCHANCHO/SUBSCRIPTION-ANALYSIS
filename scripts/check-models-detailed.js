const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function listModels() {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    try {
        console.log('Fetching models from API...');
        // Using v1beta to list models
        const axios = require('axios');
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`;
        const response = await axios.get(url);
        
        console.log('Available Models:');
        response.data.models.forEach(model => {
            console.log(`- ${model.name} (${model.displayName})`);
            console.log(`  Limits: RPM=${model.topK || 'N/A'}, Max Tokens=${model.outputTokenLimit}`);
        });
    } catch (e) {
        console.error('Error listing models:', e.response?.data?.error || e.message);
    }
}

listModels();