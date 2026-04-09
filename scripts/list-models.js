const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function listModels() {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    try {
        // 이 라이브러리 버전에서 모델 목록을 가져오는 방법이 다를 수 있으므로 직접 에러를 유도하거나 문서를 따름
        console.log('Fetching models...');
        // 실제로는 genAI 객체에서 모델을 바로 생성해보고 실패하면 목록을 보는 식
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        console.log('Model object created successfully.');
    } catch (e) {
        console.error(e);
    }
}

listModels();