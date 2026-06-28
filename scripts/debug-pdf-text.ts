import * as fs from 'fs';
import * as path from 'path';
const pdf = require('pdf-parse'); // pdf-parse 임포트

async function extractPdfText(filePath: string) {
    try {
        const dataBuffer = fs.readFileSync(filePath);
        // 최대 5페이지만 읽도록 설정
        const data = await pdf(dataBuffer, { max: 5 }); 
        console.log(`--- Extracted Text from ${path.basename(filePath)} (First 5 pages) ---`);
        console.log(data.text);
        console.log(`--- End of Extracted Text ---`);
    } catch (error) {
        console.error(`Error extracting text from PDF: ${filePath}`, error);
    }
}

const pdfPath = process.argv[2];

if (!pdfPath) {
    console.error('Usage: ts-node scripts/debug-pdf-text.ts <path_to_pdf>');
    process.exit(1);
}

extractPdfText(pdfPath);
