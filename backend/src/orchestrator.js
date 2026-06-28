const fs = require('fs');
const path = require('path');
const { Analyzer } = require('./services/analyzer'); // Analyzer 클래스 임포트

async function orchestrate() {
    console.log("🎯 [Orchestrator] 간소화된 공고문 정보 추출 시스템 가동");
    const reportFile = 'daily_report.txt';
    const datesJson = JSON.parse(fs.readFileSync('dates.json', 'utf8'));
    const targetDates = [datesJson.d1, datesJson.d2].filter(Boolean);
    const githubBase = "https://github.com/HYEONGCHANCHO/SUBSCRIPTION-ANALYSIS"; // 직접 정의 또는 환경 변수

    fs.writeFileSync(reportFile, ""); // 리포트 파일 초기화

    const analyzer = new Analyzer(); // Analyzer 인스턴스 생성

    // 특정 날짜의 PDF 파일을 처리하는 루프는 그대로 유지
    for (const targetDate of targetDates) {
        const datePath = targetDate.replace(/-/g, '/');
        const dirPath = path.join(process.cwd(), 'backend/data/downloads/CheongyakHome', datePath);
        if (!fs.existsSync(dirPath)) continue;

        const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.pdf'));
        for (const file of files) {
            const filePath = path.join(dirPath, file);
            
            console.log(`\n🔍 [Analysis] ${file} 간략 정보 추출 중...`);
            
            const result = await analyzer.analyzeFile(filePath); // Analyzer를 통해 파일 분석

            if (result) {
                const relativePdfPath = `backend/data/downloads/CheongyakHome/${datePath}/${file}`;
                const safePath = relativePdfPath.split('/').map(s => encodeURIComponent(s)).join('/');
                const downloadUrl = `${githubBase}/blob/main/${safePath}?raw=true`;

                let entry = `[공고문] ${result.title}\n`;
                entry += `  - 사이트: ${result.site}\n`;
                entry += `  - 면적: ${result.area ? `${result.area}㎡` : '확인 불가'}\n`;
                entry += `  - 분양가: ${result.price ? `${(result.price / 100000000).toFixed(1)}억원` : '확인 불가'}\n`;
                entry += `  - 마감일: ${result.dueDate || '확인 불가'}\n`;
                entry += `  - 적합성: ${result.isPassed ? '✅ 적합/권장' : `❌ 부적합 (${result.reason})`}\n`;
                if (result.summary) {
                    entry += `  - 주요 내용 (초반 요약):\n    ${result.summary.replace(/\n/g, '\n    ')}\n`;
                }
                entry += `  - 링크: ${downloadUrl}\n\n`;
                fs.appendFileSync(reportFile, entry);
            }
        }
    }
    console.log("✅ [Orchestrator] 간소화된 정보 추출 완료");
}
orchestrate();
