import { GeminiAnalyzer } from './backend/src/services/gemini-analyzer';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const API_KEY = process.env.GEMINI_API_KEY;
const TARGET_FILE = path.resolve(process.cwd(), 'backend/data/downloads/CheongyakHome/2026/03/30/건대 프라하임.pdf');
const RESULT_PATH = path.resolve(process.cwd(), 'backend/data/test-results/single-analysis-test.json');

async function runTest() {
    if (!API_KEY) {
        console.error('API_KEY missing');
        return;
    }

    const analyzer = new GeminiAnalyzer(API_KEY);
    console.log(`\n🚀 [Test] Gemini 3.1 Pro 분석 시작: ${path.basename(TARGET_FILE)}`);

    let retryCount = 0;
    const maxRetries = 2;
    let success = false;

    while (retryCount <= maxRetries && !success) {
        try {
            if (!fs.existsSync(TARGET_FILE)) {
                throw new Error(`파일을 찾을 수 없습니다: ${TARGET_FILE}`);
            }

            const result = await analyzer.analyzePdf(TARGET_FILE);
            
            if (result && typeof result.isMatch === 'boolean') {
                fs.writeFileSync(RESULT_PATH, JSON.stringify(result, null, 2));
                
                console.log('\n--- [분석 요약] ---');
                console.log(`📍 위치: ${result.summary.split('위치한')[1]?.split('의')[0]?.trim() || '정보 요약 확인 필요'}`);
                console.log(`✅ 조건 부합 여부: ${result.isMatch ? '✔️ 부합함' : '❌ 부합하지 않음'}`);
                
                if (result.isMatch) {
                    result.matchedTypes.forEach(t => {
                        console.log(`   - 타입: ${t.type}, 면적: ${t.area}㎡, 가격: ${t.price}`);
                        console.log(`     이유: ${t.reason}`);
                    });
                }
                
                console.log(`📝 요약: ${result.summary}`);
                console.log('\n--- [테스트 완료] ---');
                console.log(`결과 저장됨: ${RESULT_PATH}`);
                
                success = true;
            } else {
                throw new Error('분석 결과가 유효하지 않거나 JSON 형식이 아닙니다.');
            }
        } catch (error: any) {
            retryCount++;
            console.log(`⚠️ [Retry ${retryCount}/${maxRetries}] 오류 발생: ${error.message}`);
            if (retryCount <= maxRetries) {
                console.log('잠시 후 다시 시도합니다...');
                await new Promise(r => setTimeout(r, 5000));
            } else {
                console.error('❌ 모든 재시도 실패.');
            }
        }
    }
}

runTest();