import { GeminiAnalyzer } from './backend/src/services/gemini-analyzer';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const API_KEY = process.env.GEMINI_API_KEY;
const getKstToday = () => {
    const now = new Date();
    const kst = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    return new Date(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate());
};

const TODAY = getKstToday();

const DOWNLOAD_BASE = path.resolve(process.cwd(), 'backend/data/downloads');
const RESULT_BASE = path.resolve(process.cwd(), 'backend/data/results');

function findPdfsFrom(dir: string, start: Date): string[] {
    let results: string[] = [];
    if (!fs.existsSync(dir)) return results;
    
    const list = fs.readdirSync(dir);
    for (const file of list) {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            results = results.concat(findPdfsFrom(filePath, start));
        } else if (filePath.toLowerCase().endsWith('.pdf')) {
            const dateMatch = filePath.match(/(\d{4})[/\\](\d{2})[/\\](\d{2})/);
            if (dateMatch) {
                const fileDate = new Date(`${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`);
                if (fileDate >= start) {
                    results.push(filePath);
                }
            }
        }
    }
    return results;
}

// 전체 결과 폴더에서 파일명 중복 여부 확인
function getExistingAnalyses(): Set<string> {
    const existingNames = new Set<string>();
    const walk = (dir: string) => {
        if (!fs.existsSync(dir)) return;
        fs.readdirSync(dir).forEach(f => {
            const p = path.join(dir, f);
            if (fs.statSync(p).isDirectory()) walk(p);
            else if (f.endsWith('.json')) {
                const originalName = f.replace('[조건 미부합] ', '').replace('.json', '');
                existingNames.add(originalName);
            }
        });
    };
    walk(RESULT_BASE);
    return existingNames;
}

async function run() {
    if (!API_KEY) {
        console.error('API_KEY missing');
        return;
    }

    const analyzer = new GeminiAnalyzer(API_KEY);
    const targetPdfs = findPdfsFrom(DOWNLOAD_BASE, TODAY);

    const analyzedFileNames = getExistingAnalyses();

    console.log(`\n📅 [신규 공고 전수 분석] ${TODAY.toLocaleDateString()} 이후 대상 (${targetPdfs.length}건)`);
    console.log(`----------------------------------------------------------------`);

    for (const pdfPath of targetPdfs) {
        const fileName = path.parse(pdfPath).name;
        const relativePath = path.relative(DOWNLOAD_BASE, pdfPath);
        const parsedPath = path.parse(relativePath);
        const resultDir = path.join(RESULT_BASE, parsedPath.dir);
        
        // 1. 지능형 중복 체크
        if (analyzedFileNames.has(fileName)) {
            console.log(`⏩ [중복 스킵] 이미 분석된 공고: ${fileName}`);
            continue;
        }

        // 2. 신규 분석 알림
        console.log(`\n✨ [신규 발견] 분석 시작: ${parsedPath.base}`);
        
        try {
            if (!fs.existsSync(resultDir)) fs.mkdirSync(resultDir, { recursive: true });

            const result = await analyzer.analyzePdf(pdfPath);
            if (!result) throw new Error('분석 실패');

            // 3. 파일명 결정 (조건 부합 여부에 따라)
            const finalJsonName = result.isMatch 
                ? `${parsedPath.name}.json` 
                : `[조건 미부합] ${parsedPath.name}.json`;
            
            const finalSavePath = path.join(resultDir, finalJsonName);
            fs.writeFileSync(finalSavePath, JSON.stringify(result, null, 2));

            // 결과 요약 출력
            if (result.isMatch) {
                console.log(`   └ 🎉 [조건 부합] -> ${finalJsonName}`);
                console.log(`     - 요약: ${result.summary}`);
            } else {
                console.log(`   └ ❌ [조건 미달] -> ${finalJsonName}`);
                console.log(`     - 사유: ${result.eligibility.detail.substring(0, 70)}...`);
            }

        } catch (err: any) {
            console.error(`   └ 🚨 [오류] ${parsedPath.base}: ${err.message}`);
        }
    }
    console.log(`\n✅ 분석 작업 완료.\n`);
}

run();