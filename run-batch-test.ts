import { GeminiAnalyzer } from './backend/src/services/gemini-analyzer';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const API_KEY = process.env.GEMINI_API_KEY;
const TARGET_FILES = [
    'backend/data/downloads/CheongyakHome/2026/03/27/대방역 여의도 더로드캐슬.pdf',
    'backend/data/downloads/CheongyakHome/2026/03/26/대방역 여의도 더로드캐슬.pdf',
    'backend/data/downloads/CheongyakHome/2026/03/26/더샵 프리엘라.pdf',
    'backend/data/downloads/CheongyakHome/2026/03/26/수원이목지구 대방 디에트르 더 리체Ⅱ(A3BL) (14차).pdf',
    'backend/data/downloads/CheongyakHome/2026/03/31/아크로 드 서초.pdf',
    'backend/data/downloads/CheongyakHome/2026/03/31/더샵 신길센트럴시티.pdf',
    'backend/data/downloads/CheongyakHome/2026/03/31/오산 세교2지구 M1블록 더샵 오산역아크시티.pdf',
    'backend/data/downloads/CheongyakHome/2026/03/31/안양자이 헤리티온(2차).pdf',
    'backend/data/downloads/CheongyakHome/2026/03/31/디엠 그레이스 서초.pdf',
    'backend/data/downloads/CheongyakHome/2026/03/31/힐스테이트 용인마크밸리(7차).pdf'
];

async function runBatchTest() {
    if (!API_KEY) {
        console.error('API_KEY missing');
        return;
    }

    const analyzer = new GeminiAnalyzer(API_KEY);
    console.log(`\n🚀 [Batch Test] Gemini 1.5 Flash 분석 성능 테스트 시작 (대상: 10건)`);
    console.log(`----------------------------------------------------------------`);

    const startTime = Date.now();
    let successCount = 0;
    let matchCount = 0;

    for (let i = 0; i < TARGET_FILES.length; i++) {
        const file = path.resolve(process.cwd(), TARGET_FILES[i]);
        const fileName = path.basename(file);
        
        console.log(`[${i + 1}/10] 분석 중: ${fileName}...`);
        
        const fileStartTime = Date.now();
        const result = await analyzer.analyzePdf(file);
        const fileEndTime = Date.now();
        const duration = ((fileEndTime - fileStartTime) / 1000).toFixed(1);

        if (result) {
            successCount++;
            if (result.isMatch) matchCount++;
            console.log(`   └ ✅ 완료 (${duration}s) | 조건 부합: ${result.isMatch ? '✔️' : '❌'}`);
            if (result.isMatch) {
                console.log(`     - 요약: ${result.summary.substring(0, 80)}...`);
            }
        } else {
            console.log(`   └ ⚠️ 분석 실패`);
        }
    }

    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);
    const avgDuration = (parseFloat(totalDuration) / successCount).toFixed(1);

    console.log(`\n----------------------------------------------------------------`);
    console.log(`📊 [최종 테스트 통계]`);
    console.log(`- 총 소요 시간: ${totalDuration}s`);
    console.log(`- 평균 분석 시간: ${avgDuration}s / 건`);
    console.log(`- 분석 성공률: ${(successCount / TARGET_FILES.length * 100).toFixed(0)}% (${successCount}/10)`);
    console.log(`- 조건 부합 공고: ${matchCount}건`);
    console.log(`----------------------------------------------------------------\n`);
}

runBatchTest();