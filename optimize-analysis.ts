import { GeminiAnalyzer } from './backend/src/services/gemini-analyzer';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const API_KEY = process.env.GEMINI_API_KEY;
// KST(한국 표준시) 기준 오늘 날짜 계산
const getKstToday = () => {
    const now = new Date();
    // UTC 시간에 9시간을 더해 KST를 구함
    const kst = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    // 시, 분, 초를 0으로 초기화한 '오늘' 날짜 객체 반환
    return new Date(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate());
};

const START_DATE = getKstToday();

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
                // KST 기준 시작일(오늘) 이후의 모든 파일 포함
                if (fileDate >= start) {
                    results.push(filePath);
                }
            }
        }
    }
    return results;
}

// 전체 결과 폴더에서 파일명(날짜 무시) 중복 여부 확인
function getExistingAnalyses(): Set<string> {
    const existingNames = new Set<string>();
    const walk = (dir: string) => {
        if (!fs.existsSync(dir)) return;
        fs.readdirSync(dir).forEach(f => {
            const p = path.join(dir, f);
            if (fs.statSync(p).isDirectory()) walk(p);
            else if (f.endsWith('.json')) {
                // [조건 미부합] 태그 제거 후 원본 파일명만 추출
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
    const targetPdfs = findPdfsFrom(DOWNLOAD_BASE, START_DATE);
    
    const dateStr = (d: Date) => `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
    console.log(`\n🚀 [전수 최적화 분석] ${dateStr(START_DATE)} 이후 모든 신규 공고 대상 (${targetPdfs.length}건)`);
    console.log(`----------------------------------------------------------------`);

    const analyzedFileNames = getExistingAnalyses();
    let consecutiveErrors = 0;

    for (const pdfPath of targetPdfs) {
        const fileName = path.parse(pdfPath).name;
        const relativePath = path.relative(DOWNLOAD_BASE, pdfPath);
        const parsedPath = path.parse(relativePath);
        const resultDir = path.join(RESULT_BASE, parsedPath.dir);

        // 1. 전역 파일명 중복 체크 (날짜 무관)
        if (analyzedFileNames.has(fileName)) {
            console.log(`⏩ [중복 스킵] 다른 날짜에 이미 분석된 공고: ${fileName}`);
            continue;
        }

        console.log(`\n✨ [신규 발견] 분석 시작: ${fileName}`);
        
        try {
            if (!fs.existsSync(resultDir)) fs.mkdirSync(resultDir, { recursive: true });

            const result = await analyzer.analyzePdf(pdfPath);
            if (!result) throw new Error('분석 실패');

            const finalJsonName = result.isMatch 
                ? `${parsedPath.name}.json` 
                : `[조건 미부합] ${parsedPath.name}.json`;
            
            fs.writeFileSync(path.join(resultDir, finalJsonName), JSON.stringify(result, null, 2));
            analyzedFileNames.add(fileName); // 분석 성공 시 캐시에 추가
            consecutiveErrors = 0; // 에러 카운트 초기화

            if (result.isMatch) {
                console.log(`   └ 🎉 [조건 부합] -> ${finalJsonName}`);
                console.log(`     - 요약: ${result.summary}`);
            } else {
                console.log(`   └ ❌ [조건 미달] -> ${finalJsonName}`);
            }

            // 15 RPM(분당 15회)을 안전하게 지키기 위해 4.5초 대기
            await new Promise(r => setTimeout(r, 4500));

        } catch (err: any) {
            console.error(`   └ 🚨 [오류] ${fileName}: ${err.message}`);
            
            if (err.message.includes('429')) {
                consecutiveErrors++;
                if (consecutiveErrors >= 2) {
                    console.error('\n🛑 할당량 제한(429)이 지속되어 작업을 안전하게 중단합니다. 잠시 후 다시 실행해주세요.');
                    break;
                }
            }
        }
    }
    console.log(`\n✅ 분석 작업 완료.\n`);
}

run();