import { GeminiAnalyzer } from './services/gemini-analyzer';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
    console.error('Error: GEMINI_API_KEY is missing in .env');
    console.log('Please add GEMINI_API_KEY=your_key_here to the .env file in the root directory.');
    process.exit(1);
}

const analyzer = new GeminiAnalyzer(API_KEY);
const baseDownloadDir = path.resolve(process.cwd(), 'backend/data/downloads');
const resultsDir = path.resolve(process.cwd(), 'backend/data/results');

function getAllPdfs(dir: string): string[] {
    let results: string[] = [];
    if (!fs.existsSync(dir)) return results;
    
    const list = fs.readdirSync(dir);
    list.forEach((file) => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat && stat.isDirectory()) {
            results = results.concat(getAllPdfs(filePath));
        } else if (path.extname(file).toLowerCase() === '.pdf') {
            results.push(filePath);
        }
    });
    return results;
}

async function run() {
    console.log('🤖 AI Analysis Started based on analysis-config.md...');
    const pdfFiles = getAllPdfs(baseDownloadDir);
    
    if (pdfFiles.length === 0) {
        console.log('No PDF files found to analyze.');
        return;
    }

    if (!fs.existsSync(resultsDir)) {
        fs.mkdirSync(resultsDir, { recursive: true });
    }

    const finalResults: Record<string, any> = {};

    console.log(`Found ${pdfFiles.length} PDF files. Starting analysis...\n`);

    for (const file of pdfFiles) {
        const fileName = path.basename(file);
        console.log(`Analyzing: ${fileName}...`);
        
        const result = await analyzer.analyzePdf(file);
        if (result) {
            finalResults[fileName] = {
                path: file,
                analysis: result
            };

            if (result.isMatch) {
                console.log(`  ✅ [MATCH FOUND]:`);
                result.matchedTypes.forEach(t => {
                    console.log(`     - Type: ${t.type}, Area: ${t.area}㎡, Price: ${t.price}`);
                    console.log(`       Reason: ${t.reason}`);
                });
                console.log(`     - Summary: ${result.summary}\n`);
            } else {
                console.log(`  ❌ No matching properties found.\n`);
            }
        } else {
            console.log(`  ⚠️ Analysis failed or skipped.\n`);
        }
    }

    const outputFilePath = path.join(resultsDir, 'ai-analysis-output.json');
    fs.writeFileSync(outputFilePath, JSON.stringify(finalResults, null, 2));
    console.log(`🎉 Analysis complete. Details saved to: ${outputFilePath}`);
}

run();