const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');
const contextManager = require('./utils/context-manager');

async function orchestrate() {
    console.log("🎯 [Orchestrator] 하이브리드 정밀 분석 시스템 가동 (Text + File Analysis)");
    const reportFile = 'daily_report.txt';
    const datesJson = JSON.parse(fs.readFileSync('dates.json', 'utf8'));
    const targetDates = [datesJson.d1, datesJson.d2].filter(Boolean);
    const githubBase = contextManager.data.fixedInfo.githubBase;

    fs.writeFileSync(reportFile, "");

    for (const targetDate of targetDates) {
        const datePath = targetDate.replace(/-/g, '/');
        const dirPath = path.join(process.cwd(), 'backend/data/downloads/CheongyakHome', datePath);
        if (!fs.existsSync(dirPath)) continue;

        const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.pdf'));
        for (const file of files) {
            const filePath = path.join(dirPath, file);
            const resultDir = path.join(process.cwd(), 'backend/data/results/CheongyakHome', datePath);
            if (!fs.existsSync(resultDir)) fs.mkdirSync(resultDir, { recursive: true });
            const resultFile = path.join(resultDir, file.replace('.pdf', '.json'));
            
            console.log(`\n🔍 [Analysis] ${file} 처리 중...`);
            
            let rawText = "";
            try {
                rawText = execSync(`node extract_text.js "${filePath}"`, { encoding: 'utf8' });
            } catch(e) { rawText = ""; }

            // 유형 판별: 텍스트가 부족하거나 핵심 키워드가 없으면 파일 직접 분석으로 전환
            const isTextReliable = rawText.length > 2000 && (rawText.includes("위치") || rawText.includes("금액"));
            
            let finalReport = "";
            if (isTextReliable) {
                console.log(`   📝 [Mode: Text-Based] 2단계 분석을 수행합니다.`);
                // Stage 1: 식별
                const s1Prompt = `${contextManager.getStage1Prompt()}\n\n[텍스트]\n${rawText.substring(0, 30000)}`;
                fs.writeFileSync('temp_s1.txt', s1Prompt);
                const s1Result = execSync(`gemini -y --raw-output < temp_s1.txt`, { encoding: 'utf8' });
                
                // Stage 2: 리포트
                const s2Prompt = `${contextManager.getStage2Prompt()}\n\n### 식별정보\n${s1Result}\n\n### 공고문\n${rawText.substring(0, 30000)}`;
                fs.writeFileSync('temp_s2.txt', s2Prompt);
                finalReport = execSync(`gemini -y --raw-output < temp_s2.txt`, { encoding: 'utf8' });
                fs.unlinkSync('temp_s1.txt'); fs.unlinkSync('temp_s2.txt');
            } else {
                console.log(`   🖼️ [Mode: File-Based] 텍스트가 부실하여 파일을 직접 시각 분석합니다.`);
                const filePrompt = `${contextManager.getStage2Prompt()}\n\n주의: 이 PDF 파일을 직접 시각적으로 읽어서 표 데이터를 정확히 분석하십시오.`;
                // Gemini CLI의 파일 직접 입력 기능 활용
                finalReport = execSync(`gemini -y --raw-output "${filePrompt}" "${filePath}"`, { encoding: 'utf8' });
            }

            if (finalReport) {
                const relativePdfPath = `backend/data/downloads/CheongyakHome/${datePath}/${file}`;
                const safePath = relativePdfPath.split('/').map(s => encodeURIComponent(s)).join('/');
                const downloadUrl = `${githubBase}/blob/main/${safePath}?raw=true`;

                let entry = `[분석 대상] ${file.replace('.pdf', '')}\n`;
                // Gemini 응답에서 가끔 포함되는 마크다운 기호 등 정제
                entry += `${finalReport.replace(/```markdown/g, '').replace(/```/g, '').trim()}\n\n`;
                entry += `🔗공고문링크: ${downloadUrl}\n\n`;
                fs.appendFileSync(reportFile, entry);
            }
        }
    }
    console.log("✅ [Orchestrator] 모든 하이브리드 분석 완료");
}
orchestrate();
