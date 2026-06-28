const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');
const contextManager = require('./utils/context-manager');
const pdf = require('pdf-parse'); // PDF 텍스트 추출을 위해 추가

// Analyzer 클래스 임포트 제거 - 더 이상 사용하지 않음
// const { Analyzer } = require('./services/analyzer'); 

async function orchestrate() {
    const RUN_AI_ANALYSIS = process.env.RUN_AI_ANALYSIS === 'true';

    console.log(`🎯 [Orchestrator] 시스템 가동 (AI 분석: ${RUN_AI_ANALYSIS ? '활성화' : '비활성화'})`);
    const reportFile = 'daily_report.txt';
    const datesJson = JSON.parse(fs.readFileSync('dates.json', 'utf8'));
    const targetDates = [datesJson.d1, datesJson.d2].filter(Boolean);
    const githubBase = contextManager.data.fixedInfo.githubBase;

    fs.writeFileSync(reportFile, ""); // 리포트 파일 초기화

    // Analyzer 인스턴스 생성 코드 제거
    // const analyzer = new Analyzer(); 

    for (const targetDate of targetDates) {
        const datePath = targetDate.replace(/-/g, '/');
        const dirPath = path.join(process.cwd(), 'backend/data/downloads/CheongyakHome', datePath);
        if (!fs.existsSync(dirPath)) continue;

        const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.pdf'));
        for (const file of files) {
            const filePath = path.join(dirPath, file);
            const resultDir = path.join(process.cwd(), 'backend/data/results/CheongyakHome', datePath);
            if (!fs.existsSync(resultDir)) fs.mkdirSync(resultDir, { recursive: true });
            
            console.log(`
🔍 [Processing] ${file} (AI: ${RUN_AI_ANALYSIS ? '활성' : '비활성'})...`);
            
            let reportEntryContent = ""; // 최종 보고서 항목 내용

            if (RUN_AI_ANALYSIS) {
                // 기존 AI 분석 로직은 그대로 유지
                let rawText = "";
                try {
                    rawText = execSync(`node extract_text.js "${filePath}"`, { encoding: 'utf8' });
                } catch(e) { rawText = ""; }

                const isTextReliable = rawText.length > 2000 && (rawText.includes("위치") || rawText.includes("금액"));
                
                let finalReport = "";
                if (isTextReliable) {
                    console.log(`   📝 [Mode: Text-Based] 핵심 문맥 추출 후 2단계 분석을 수행합니다.`);
                    
                    const importantKeywords = ["공급금액", "분양가", "최고금액", "모집공고"];
                    let contextText = "";
                    importantKeywords.forEach(kw => {
                        const index = rawText.indexOf(kw);
                        if (index !== -1) {
                            contextText += `
...${rawText.substring(Math.max(0, index - 500), index + 3000)}...
`;
                        }
                    });
                    if (contextText.length < 5000) contextText = rawText.substring(0, 20000);

                    const s1Prompt = `${contextManager.getStage1Prompt()}

[핵심 텍스트]
${contextText}`;
                    fs.writeFileSync('temp_s1.txt', s1Prompt);
                    const s1Result = execSync(`npx gemini -y --raw-output < temp_s1.txt`, { encoding: 'utf8' });
                    
                    const s2Prompt = `${contextManager.getStage2Prompt()}

### 식별정보
${s1Result}

### 발췌된 공고문 내용
${contextText}

⚠️ 주의: 제공된 텍스트에 없는 주택형이나 금액은 절대 지어내지 마세요. 확인이 불가능하면 반드시 '확인 불가'라고 적으세요.`;
                    fs.writeFileSync('temp_s2.txt', s2Prompt);
                    finalReport = execSync(`npx gemini -y --raw-output < temp_s2.txt`, { encoding: 'utf8' });
                    fs.unlinkSync('temp_s1.txt'); fs.unlinkSync('temp_s2.txt');
                } else {
                    console.log(`   🖼️ [Mode: File-Based] 텍스트가 부실하여 파일을 직접 시각 분석합니다.`);
                    const filePrompt = `${contextManager.getStage2Prompt()}

주의: 이 PDF 파일을 직접 시각적으로 읽어서 표 데이터를 정확히 분석하십시오.`;
                    finalReport = execSync(`npx gemini -y --raw-output "${filePrompt}" "${filePath}"`, { encoding: 'utf8' });
                }
                reportEntryContent = finalReport; // AI 분석 결과가 보고서 내용이 됨

            } else {
                // AI 분석 비활성 모드: 공고명과 PDF 링크만 출력 (Analyzer 사용 안 함)
                console.log(`   📝 [Mode: Basic Info] 공고명과 PDF 링크 및 첫 페이지 요약만 추출합니다.`);
                let summaryText = "";
                try {
                    const data = await pdf(fs.readFileSync(filePath), { max: 1 }); // 첫 페이지만 읽어서 제목 추출 시도
                    summaryText = data.text.split('
').slice(0, 5).join(' ').trim(); // 첫 5줄 요약
                } catch (e) {
                    summaryText = "PDF 요약 추출 실패";
                }

                reportEntryContent = `[공고문] ${file.replace('.pdf', '')}
`;
                reportEntryContent += `  - 주요 내용 (첫 페이지 요약): ${summaryText.substring(0, 100)}...
`;
            }

            if (reportEntryContent) {
                const relativePdfPath = `backend/data/downloads/CheongyakHome/${datePath}/${file}`;
                const safePath = relativePdfPath.split('/').map(s => encodeURIComponent(s)).join('/');
                const downloadUrl = `${githubBase}/blob/main/${safePath}?raw=true`;

                let entry = reportEntryContent.trim();
                entry += `
${downloadUrl}

`; // 라벨 제거, URL만 남김
                fs.appendFileSync(reportFile, entry);
            }
        }
    }
    console.log("✅ [Orchestrator] 분석/정보 추출 완료");
}
orchestrate();