import { GeminiAnalyzer } from './backend/src/services/gemini-analyzer';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { execSync } from 'child_process';

dotenv.config();

const API_KEY = process.env.GEMINI_API_KEY;
// KST 기준 오늘 날짜 계산
const getKstToday = () => {
    const now = new Date();
    const kst = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    return new Date(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate());
};

const TODAY = getKstToday();
const DOWNLOAD_BASE = path.resolve(process.cwd(), 'backend/data/downloads');
const RESULT_BASE = path.resolve(process.cwd(), 'backend/data/results');

function findPdfs(dir: string): string[] {
    let results: string[] = [];
    if (!fs.existsSync(dir)) return results;
    const list = fs.readdirSync(dir);
    for (const file of list) {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            results = results.concat(findPdfs(filePath));
        } else if (filePath.toLowerCase().endsWith('.pdf')) {
            results.push(filePath);
        }
    }
    return results;
}

async function run() {
    if (!API_KEY) {
        console.error('API_KEY missing');
        return;
    }

    const analyzer = new GeminiAnalyzer(API_KEY);
    
    // KST 기준 오늘 날짜의 공고만 필터링 (YYYY/MM/DD 형식 폴더 구조 가정)
    const year = TODAY.getFullYear();
    const month = String(TODAY.getMonth() + 1).padStart(2, '0');
    const day = String(TODAY.getDate()).padStart(2, '0');
    const datePath = `${year}/${month}/${day}`;

    const allPdfs = findPdfs(DOWNLOAD_BASE);
    const targetPdfs = allPdfs.filter(p => p.includes(datePath));

    console.log(`\n🚀 [맞춤형 AI 분석] KST 기준 ${datePath} 공고 대상 실행 (${targetPdfs.length}건)`);
    console.log(`----------------------------------------------------------------`);

    for (const pdfPath of targetPdfs) {
        const relativePath = path.relative(DOWNLOAD_BASE, pdfPath);
        const parsedPath = path.parse(relativePath);
        
        // 결과 저장 경로: 다운로드 폴더 구조를 그대로 미러링 (확장자만 .json)
        const resultDir = path.join(RESULT_BASE, parsedPath.dir);
        const resultPath = path.join(resultDir, `${parsedPath.name}.json`);

        if (!fs.existsSync(resultDir)) {
            fs.mkdirSync(resultDir, { recursive: true });
        }

        // 1. 중복 분석 방지 로직
        if (fs.existsSync(resultPath)) {
            console.log(`⏩ [스킵] 이미 분석된 공고: ${parsedPath.base}`);
            continue;
        }

        // 2. 신규 분석 대상 알림
        console.log(`\n✨ [신규 발견] 새로운 공고 분석 시작: ${parsedPath.base}`);
        
        try {
            const result = await analyzer.analyzePdf(pdfPath);
            if (!result) throw new Error('분석 결과 반환 실패');

            // JSON 결과 개별 저장
            fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));

            // 3. 기한 만료 필터링
            const applyDateStr = result.applyDate;
            const applyDate = new Date(applyDateStr);
            let isExpired = false;
            
            if (!isNaN(applyDate.getTime()) && applyDate < TODAY) {
                isExpired = true;
            }

            if (isExpired) {
                console.log(`   └ ⚠️ [기한 만료] 청약 시작일(${applyDateStr})이 지났습니다. (분석 결과는 저장됨)`);
                continue;
            }

            // 조건 부합 시 콘솔 출력
            if (result.isMatch) {
                console.log(`   └ 🎉 [조건 부합 완벽 일치!]`);
                console.log(`     - 요약: ${result.summary}`);
                console.log(`     - 출근 예상 (동천역): ${result.commute?.toDongcheon || 'N/A'}`);
                console.log(`     - 매력도: ${result.marketAnalysis?.attractiveness || 'N/A'}`);
            } else {
                console.log(`   └ ❌ [조건 미달]`);
                console.log(`     - 사유: ${result.eligibility?.detail?.substring(0, 80) || '자격 조건 불일치'}...`);
            }

        } catch (err: any) {
            console.error(`   └ 🚨 [오류] 분석 실패: ${err.message}`);
        }
    }
    console.log(`\n✅ 분석 작업 완료.\n`);
}

run();