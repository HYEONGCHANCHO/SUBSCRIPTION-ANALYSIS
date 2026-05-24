const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');
const contextManager = require('./utils/context-manager');

async function orchestrate() {
    console.log("🎯 [Orchestrator] 정밀 리포트 생성...");
    const reportFile = 'daily_report.txt';
    const datesJson = JSON.parse(fs.readFileSync('dates.json', 'utf8'));
    const targetDates = [datesJson.d1, datesJson.d2].filter(Boolean);
    const githubBase = contextManager.data.fixedInfo.githubBase;

    const systemPrompt = contextManager.getSystemPrompt() + "\n추가 지시: 위치, 유형, 입지 강점, 주의사항을 아주 상세히 분석하세요.";
    fs.writeFileSync(reportFile, "");

    const downloadsDir = path.join(process.cwd(), 'backend/data/downloads/CheongyakHome');

    for (const targetDate of targetDates) {
        const datePath = targetDate.replace(/-/g, '/');
        const dirPath = path.join(downloadsDir, datePath);
        if (!fs.existsSync(dirPath)) continue;

        const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.pdf'));
        for (const file of files) {
            const filePath = path.join(dirPath, file);
            const resultDir = path.join(process.cwd(), 'backend/data/results/CheongyakHome', datePath);
            if (!fs.existsSync(resultDir)) fs.mkdirSync(resultDir, { recursive: true });
            const resultFile = path.join(resultDir, file.replace('.pdf', '.json'));
            
            let analysis;
            // 1. 캐시 체크 (기존 캐시가 상세 정보를 포함하지 않으면 무효화)
            if (fs.existsSync(resultFile)) {
                try {
                    analysis = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
                    // 상세 정보가 없거나 모순되는 이전 캐시(isMatch만 있고 상세분석 없는 경우 등)는 재분석
                    if (!analysis.상세분석 || !analysis.상세분석.입지강점) throw new Error('Incomplete cache');
                } catch(e) { 
                    analysis = null; 
                    console.log(`   ♻️ [Re-analyzing] 상세 정보 보강을 위해 재분석: ${file}`);
                }
            }

            // 2. 분석 수행
            if (!analysis) {
                console.log(`   🔍 [Deep Analysis] ${file}...`);
                const text = execSync(`node extract_text.js "${filePath}" | head -c 15000`, { encoding: 'utf8' });
                const fullPrompt = `${systemPrompt}\n\n[대상] ${file}\n[텍스트]\n${text}`;
                const promptPath = path.join(process.cwd(), 'temp_prompt.txt');
                fs.writeFileSync(promptPath, fullPrompt);
                try {
                    const result = execSync(`gemini -y --raw-output < "${promptPath}"`, { encoding: 'utf8' });
                    const jsonMatch = result.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        analysis = JSON.parse(jsonMatch[0].replace(/```json/g, '').replace(/```/g, '').trim());
                        fs.writeFileSync(resultFile, JSON.stringify(analysis, null, 2));
                    }
                } catch(e) { console.log(`   ⚠️ 분석 에러: ${file}`); }
                if (fs.existsSync(promptPath)) fs.unlinkSync(promptPath);
            }

            if (analysis) {
                // 판정 로직 강화 (텍스트 내용과 일치하도록)
                const analysisResult = analysis.분석결과 || "";
                const isMatch = analysis.isMatch === true || analysisResult.includes("적격") || analysisResult.includes("부합");
                const statusStr = isMatch ? '✅ 조건부합' : '❌ 조건미달';
                
                // GitHub 링크 생성 (URL 인코딩 철저)
                const relativePdfPath = `backend/data/downloads/CheongyakHome/${datePath}/${file}`;
                const repoPath = githubBase.replace('https://github.com/', '');
                const encodedPath = relativePdfPath.split('/').map(segment => encodeURIComponent(segment)).join('/');
                const downloadUrl = `https://raw.githubusercontent.com/${repoPath}/main/${encodedPath}`;
                
                const detail = analysis.상세분석 || {};
                
                let entry = `[분석 대상] ${file.replace('.pdf', '')}\n`;
                entry += `• 판정: ${statusStr}\n`;
                entry += `• 위치: ${detail.위치 || detail.지역 || "정보 없음"}\n`;
                entry += `• 유형: ${detail.공급유형 || detail.유형 || "정보 없음"}\n`;
                entry += `• 정보: ${analysis.면적 || '-'} / ${analysis.가격 || '-'}\n`;
                entry += `• 요약: ${analysis.요약사유 || '내용 없음'}\n`;
                entry += `• 강점: ${detail.입지강점 || detail.강점 || "공고문 참조"}\n`;
                entry += `• 주의: ${detail.주의사항 || detail.단점 || "공고문 참조"}\n`;
                // 링크가 유실되지 않도록 명확한 구분자 사용 및 줄바꿈 추가
                entry += `\n🔗LINK:${downloadUrl}\n\n`;
                fs.appendFileSync(reportFile, entry);
            }
        }
    }
    console.log("✅ [Orchestrator] 리포트 생성 완료");
}
orchestrate();
