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
                console.log(`   📝 [Mode: Text-Based] 핵심 문맥 추출 후 2단계 분석을 수행합니다.`);
                
                // 분양가 및 공급내역 키워드 주변 문맥 우선 추출 (Hallucination 방지)
                const importantKeywords = ["공급금액", "분양가", "최고금액", "모집공고"];
                let contextText = "";
                importantKeywords.forEach(kw => {
                    const index = rawText.indexOf(kw);
                    if (index !== -1) {
                        contextText += `\n...${rawText.substring(Math.max(0, index - 500), index + 3000)}...\n`;
                    }
                });
                if (contextText.length < 5000) contextText = rawText.substring(0, 20000);

                // Stage 1: 식별
                const s1Prompt = `${contextManager.getStage1Prompt()}\n\n[핵심 텍스트]\n${contextText}`;
                fs.writeFileSync('temp_s1.txt', s1Prompt);
                const s1Result = execSync(`npx gemini -y --raw-output < temp_s1.txt`, { encoding: 'utf8' });
                
                // Stage 2: 리포트 (추측 금지 지침 강화)
                const s2Prompt = `${contextManager.getStage2Prompt()}\n\n### 식별정보\n${s1Result}\n\n### 발췌된 공고문 내용\n${contextText}\n\n⚠️ 주의: 제공된 텍스트에 없는 주택형이나 금액은 절대 지어내지 마세요. 확인이 불가능하면 반드시 '확인 불가'라고 적으세요.`;
                fs.writeFileSync('temp_s2.txt', s2Prompt);
                finalReport = execSync(`npx gemini -y --raw-output < temp_s2.txt`, { encoding: 'utf8' });
                fs.unlinkSync('temp_s1.txt'); fs.unlinkSync('temp_s2.txt');
            } else {
                console.log(`   🖼️ [Mode: File-Based] 텍스트가 부실하여 파일을 직접 시각 분석합니다.`);
                const filePrompt = `${contextManager.getStage2Prompt()}\n\n주의: 이 PDF 파일을 직접 시각적으로 읽어서 표 데이터를 정확히 분석하십시오.`;
                // Gemini CLI의 파일 직접 입력 기능 활용
                finalReport = execSync(`npx gemini -y --raw-output "${filePrompt}" "${filePath}"`, { encoding: 'utf8' });
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
