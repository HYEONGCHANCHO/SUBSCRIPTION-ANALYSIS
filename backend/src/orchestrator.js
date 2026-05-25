const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');
const contextManager = require('./utils/context-manager');

async function orchestrate() {
    console.log("🎯 [Orchestrator] 2단계 정밀 분석(Map-Reduce) 가동...");
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
            console.log(`\n🔍 [Stage 1: Mapping] ${file}...`);
            
            const rawText = execSync(`node extract_text.js "${filePath}"`, { encoding: 'utf8' });
            
            // Stage 1: 정보 위치 식별
            const stage1Prompt = `${contextManager.getStage1Prompt()}\n\n[분석 대상] ${file}\n[공고문 본문]\n${rawText.substring(0, 35000)}`;
            const stage1Path = path.join(process.cwd(), 'stage1_prompt.txt');
            fs.writeFileSync(stage1Path, stage1Prompt);
            
            let stage1Result = "";
            try {
                stage1Result = execSync(`gemini -y --raw-output < "${stage1Path}"`, { encoding: 'utf8' });
            } catch(e) { console.log(`   ⚠️ Stage 1 에러: ${file}`); continue; }

            console.log(`🚀 [Stage 2: Reducing] 리포트 생성 중...`);
            
            // Stage 2: 최종 분석 리포트 생성
            const stage2Prompt = `${contextManager.getStage2Prompt()}\n\n### 1단계 식별 정보\n${stage1Result}\n\n### 공고문 본문\n${rawText.substring(0, 35000)}`;
            const stage2Path = path.join(process.cwd(), 'stage2_prompt.txt');
            fs.writeFileSync(stage2Path, stage2Prompt);

            let finalReport = "";
            try {
                finalReport = execSync(`gemini -y --raw-output < "${stage2Path}"`, { encoding: 'utf8' });
                // 결과를 JSON으로 관리하지 않고 텍스트 기반으로 가공하여 리포트 생성
                const relativePdfPath = `backend/data/downloads/CheongyakHome/${datePath}/${file}`;
                const safePath = relativePdfPath.split('/').map(s => encodeURIComponent(s)).join('/');
                const downloadUrl = `${githubBase}/blob/main/${safePath}?raw=true`;

                let entry = `[분석 대상] ${file.replace('.pdf', '')}\n`;
                entry += `${finalReport.trim()}\n\n`;
                entry += `🔗공고문링크: ${downloadUrl}\n\n`;
                fs.appendFileSync(reportFile, entry);
            } catch(e) { console.log(`   ⚠️ Stage 2 에러: ${file}`); }

            // 임시 파일 정리
            [stage1Path, stage2Path].forEach(p => { if(fs.existsSync(p)) fs.unlinkSync(p); });
        }
    }
    console.log("✅ [Orchestrator] 모든 단계 완료");
}
orchestrate();
