const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');
const contextManager = require('./utils/context-manager'); // contextManager 복구

// Analyzer 클래스 임포트 (간소화된 분석용)
const { Analyzer } = require('./services/analyzer'); 

async function orchestrate() {
    const RUN_AI_ANALYSIS = process.env.RUN_AI_ANALYSIS === 'true';

    console.log(`🎯 [Orchestrator] 시스템 가동 (AI 분석: ${RUN_AI_ANALYSIS ? '활성화' : '비활성화'})`);
    const reportFile = 'daily_report.txt';
    const datesJson = JSON.parse(fs.readFileSync('dates.json', 'utf8'));
    const targetDates = [datesJson.d1, datesJson.d2].filter(Boolean);
    const githubBase = contextManager.data.fixedInfo.githubBase; // contextManager에서 가져옴

    fs.writeFileSync(reportFile, ""); // 리포트 파일 초기화

    const analyzer = new Analyzer(); // 간소화된 분석용 Analyzer 인스턴스

    for (const targetDate of targetDates) {
        const datePath = targetDate.replace(/-/g, '/');
        const dirPath = path.join(process.cwd(), 'backend/data/downloads/CheongyakHome', datePath);
        if (!fs.existsSync(dirPath)) continue;

        const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.pdf'));
        for (const file of files) {
            const filePath = path.join(dirPath, file);
            const resultDir = path.join(process.cwd(), 'backend/data/results/CheongyakHome', datePath);
            if (!fs.existsSync(resultDir)) fs.mkdirSync(resultDir, { recursive: true });
            
            console.log(`\n🔍 [Analysis] ${file} 처리 중 (AI: ${RUN_AI_ANALYSIS ? '활성' : '비활성'})...`);
            
            let finalReport = "";

            if (RUN_AI_ANALYSIS) {
                // 기존 AI 분석 로직
                let rawText = "";
                try {
                    rawText = execSync(`node extract_text.js "${filePath}"`, { encoding: 'utf8' });
                } catch(e) { rawText = ""; }

                const isTextReliable = rawText.length > 2000 && (rawText.includes("위치") || rawText.includes("금액"));
                
                if (isTextReliable) {
                    console.log(`   📝 [Mode: Text-Based] 핵심 문맥 추출 후 2단계 분석을 수행합니다.`);
                    
                    const importantKeywords = ["공급금액", "분양가", "최고금액", "모집공고"];
                    let contextText = "";
                    importantKeywords.forEach(kw => {
                        const index = rawText.indexOf(kw);
                        if (index !== -1) {
                            contextText += `\n...${rawText.substring(Math.max(0, index - 500), index + 3000)}...\n`;
                        }
                    });
                    if (contextText.length < 5000) contextText = rawText.substring(0, 20000);

                    const s1Prompt = `${contextManager.getStage1Prompt()}\n\n[핵심 텍스트]\n${contextText}`;
                    fs.writeFileSync('temp_s1.txt', s1Prompt);
                    const s1Result = execSync(`npx gemini -y --raw-output < temp_s1.txt`, { encoding: 'utf8' });
                    
                    const s2Prompt = `${contextManager.getStage2Prompt()}\n\n### 식별정보\n${s1Result}\n\n### 발췌된 공고문 내용\n${contextText}\n\n⚠️ 주의: 제공된 텍스트에 없는 주택형이나 금액은 절대 지어내지 마세요. 확인이 불가능하면 반드시 '확인 불가'라고 적으세요.`;
                    fs.writeFileSync('temp_s2.txt', s2Prompt);
                    finalReport = execSync(`npx gemini -y --raw-output < temp_s2.txt`, { encoding: 'utf8' });
                    fs.unlinkSync('temp_s1.txt'); fs.unlinkSync('temp_s2.txt');
                } else {
                    console.log(`   🖼️ [Mode: File-Based] 텍스트가 부실하여 파일을 직접 시각 분석합니다.`);
                    const filePrompt = `${contextManager.getStage2Prompt()}\n\n주의: 이 PDF 파일을 직접 시각적으로 읽어서 표 데이터를 정확히 분석하십시오.`;
                    finalReport = execSync(`npx gemini -y --raw-output "${filePrompt}" "${filePath}"`, { encoding: 'utf8' });
                }
            } else {
                // 간소화된 분석 로직
                const result = await analyzer.analyzeFile(filePath);

                if (result) {
                    finalReport = `[공고문] ${result.title}\n`;
                    finalReport += `  - 사이트: ${result.site}\n`;
                    finalReport += `  - 면적: ${result.area ? `${result.area}㎡` : '확인 불가'}\n`;
                    finalReport += `  - 분양가: ${result.price ? `${(result.price / 100000000).toFixed(1)}억원` : '확인 불가'}\n`;
                    finalReport += `  - 마감일: ${result.dueDate || '확인 불가'}\n`;
                    finalReport += `  - 적합성: ${result.isPassed ? '✅ 적합/권장' : `❌ 부적합 (${result.reason})`}\n`;
                    if (result.summary) {
                        finalReport += `  - 주요 내용 (초반 요약):\n    ${result.summary.replace(/\n/g, '\n    ')}\n`;
                    }
                }
            }

            if (finalReport) {
                const relativePdfPath = `backend/data/downloads/CheongyakHome/${datePath}/${file}`;
                const safePath = relativePdfPath.split('/').map(s => encodeURIComponent(s)).join('/');
                const downloadUrl = `${githubBase}/blob/main/${safePath}?raw=true`;

                let entry = finalReport.trim(); // finalReport가 이미 형식화된 내용을 가지고 있음
                entry += `\n🔗공고문링크: ${downloadUrl}\n\n`;
                fs.appendFileSync(reportFile, entry);
            }
        }
    }
    console.log("✅ [Orchestrator] 분석/정보 추출 완료");
}
orchestrate();
