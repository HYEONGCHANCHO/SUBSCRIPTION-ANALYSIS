import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import * as fs from 'fs';
import * as path from 'path';
import * as mime from 'mime-types';

export class GeminiAnalyzer {
    private genAI: GoogleGenerativeAI;
    private model: any;

    constructor(apiKey: string) {
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
    }

    async analyzeDocument(prompt: string, filePath: string): Promise<string> {
        const fileExtension = path.extname(filePath).toLowerCase();
        const mimeType = mime.lookup(fileExtension) || 'application/octet-stream';

        // Check if the file is a PDF and if it exists
        if (mimeType !== 'application/pdf' || !fs.existsSync(filePath)) {
            throw new Error('Only PDF files are supported for direct analysis.');
        }

        const fileData = fs.readFileSync(filePath);
        const base64Data = fileData.toString('base64');

        const filePart: Part = {
            inlineData: {
                data: base64Data,
                mimeType: 'application/pdf'
            }
        };

        const result = await this.model.generateContent([prompt, filePart]);
        const response = result.response;
        return response.text();
    }

    async analyzeText(prompt: string, text: string): Promise<string> {
        const result = await this.model.generateContent([prompt, text]);
        const response = result.response;
        return response.text();
    }
}
