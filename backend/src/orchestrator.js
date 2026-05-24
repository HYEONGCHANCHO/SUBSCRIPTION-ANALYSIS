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

    const systemPrompt = contextManager.getSystemPrompt() + "\n상세 분석 항목: 위치, 공급유형, 입지 강점, 주의사항";
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
            const resultFile = path.join(resultDir, file.replace('.pdf', '.json'));
            
            let analysis;
            if (fs.existsSync(resultFile)) {
                try {
                    analysis = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
                } catch(e) { analysis = null; }
            }

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
                } catch(e) { console.log(`   ⚠️ 에러: ${file}`); }
                if (fs.existsSync(promptPath)) fs.unlinkSync(promptPath);
            }

            if (analysis) {
                const isMatch = analysis.isMatch === true || (analysis.분석결과 && analysis.분석결과.includes("적격"));
                const statusStr = isMatch ? '✅ 조건부합' : '❌ 조건미달';
                
                // GitHub PDF 직접 다운로드 링크 생성
                const relativePdfPath = `backend/data/downloads/CheongyakHome/${datePath}/${file}`;
                const downloadUrl = `${githubBase}/blob/main/${encodeURI(relativePdfPath)}?raw=true`;
                
                const detail = analysis.상세분석 || {};
                const location = detail.위치 || detail.지역 || "정보 없음";
                const type = detail.공급유형 || detail.유형 || "정보 없음";
                const strength = detail.입지강점 || detail.강점 || "공고문 참조";
                const caution = detail.주의사항 || detail.단점 || "공고문 참조";
                
                let entry = `[분석 대상] ${file.replace('.pdf', '')}\n`;
                entry += `• 판정: ${statusStr}\n`;
                entry += `• 위치: ${location}\n`;
                entry += `• 유형: ${type}\n`;
                entry += `• 정보: ${analysis.면적 || '-'} / ${analysis.가격 || '-'}\n`;
                entry += `• 요약: ${analysis.요약사유 || '내용 없음'}\n`;
                entry += `• 강점: ${strength}\n`;
                entry += `• 주의: ${caution}\n`;
                entry += `🔗LINK:${downloadUrl}\n\n`;
                fs.appendFileSync(reportFile, entry);
            }
        }
    }
    console.log("✅ [Orchestrator] 리포트 생성 완료");
}
orchestrate();
