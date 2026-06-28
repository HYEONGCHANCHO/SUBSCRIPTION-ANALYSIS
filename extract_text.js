const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse'); // pdf-parse 임포트

async function extractText(filePath) {
    try {
        const dataBuffer = fs.readFileSync(filePath);
        // 최대 10페이지만 읽도록 설정 (Gemini Context Window 최적화)
        const data = await pdf(dataBuffer, { max: 10 }); 
        console.log(data.text);
    } catch (error) {
        console.error(`Error extracting text from PDF: ${filePath}`, error);
        process.exit(1);
    }
}

const pdfPath = process.argv[2];

if (!pdfPath) {
    console.error('Usage: node extract_text.js <path_to_pdf>');
    process.exit(1);
}

extractText(pdfPath);
