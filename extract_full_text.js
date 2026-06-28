const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse'); // pdf-parse 임포트

async function extractFullText(filePath) {
    try {
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdf(dataBuffer); 
        console.log(data.text);
    } catch (error) {
        console.error(`Error extracting full text from PDF: ${filePath}`, error);
        process.exit(1);
    }
}

const pdfPath = process.argv[2];

if (!pdfPath) {
    console.error('Usage: node extract_full_text.js <path_to_pdf>');
    process.exit(1);
}

extractFullText(pdfPath);
