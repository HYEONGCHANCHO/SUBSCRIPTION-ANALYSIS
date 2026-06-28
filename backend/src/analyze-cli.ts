import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';
import * as path from 'path';
import * as mime from 'mime-types';
import * as dotenv from 'dotenv';

dotenv.config();

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
    console.error('GEMINI_API_KEY is not set in your .env file.');
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

async function runAnalysis() {
    const args = process.argv.slice(2);
    let prompt: string | undefined;
    let filePath: string | undefined;

    if (args.length === 0) {
        console.error('Usage: analyze-cli.ts <prompt_text> [file_path]');
        console.error('       analyze-cli.ts --file <prompt_file_path> [file_path]');
        process.exit(1);
    }

    if (args[0] === '--file') {
        if (args.length < 2) {
            console.error('Usage: analyze-cli.ts --file <prompt_file_path> [file_path]');
            process.exit(1);
        }
        prompt = fs.readFileSync(args[1], 'utf8');
        filePath = args[2];
    } else {
        prompt = args[0];
        filePath = args[1];
    }

    if (!prompt) {
        console.error('Prompt is missing.');
        process.exit(1);
    }

    try {
        let result;
        if (filePath) {
            const fileExtension = path.extname(filePath).toLowerCase();
            const mimeType = mime.lookup(fileExtension) || 'application/octet-stream';

            if (mimeType !== 'application/pdf' || !fs.existsSync(filePath)) {
                console.error('Only PDF files are supported for direct analysis or file does not exist.');
                process.exit(1);
            }

            const fileData = fs.readFileSync(filePath);
            const base64Data = fileData.toString('base64');

            const filePart = {
                inlineData: {
                    data: base64Data,
                    mimeType: 'application/pdf'
                }
            };
            result = await model.generateContent([prompt, filePart]);
        } else {
            result = await model.generateContent([prompt]);
        }

        const response = result.response;
        console.log(response.text());
    } catch (error) {
        console.error('Error during analysis:', error);
        process.exit(1);
    }
}

runAnalysis();
