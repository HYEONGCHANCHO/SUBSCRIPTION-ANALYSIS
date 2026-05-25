const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');
const contextManager = require('./utils/context-manager');

async function orchestrate() {
    console.log("🎯 [Orchestrator] 검색 결합 정밀 분석 가동...");
    const reportFile = 'daily_report.txt';
    const datesJson = JSON.parse(fs.readFileSync('dates.json', 'utf8'));
    const targetDates = [datesJson.d1, datesJson.d2].filter(Boolean);
    const githubBase = contextManager.data.fixedInfo.githubBase;

    const systemPrompt = `
당신은 대한민국 청약 공고 팩트체크 분석관입니다.
제공된 텍스트와 당신의 지식(인터넷 검색 활용 가능)을 결합하여 분석하세요.

### 📋 분석 지침
1. **위치 우선 확인**: [분석 대상] 파일명을 기반으로 실제 단지 위치를 정확히 파악하세요. 
2. **텍스트 부족 시 검색**: 공고문 텍스트가 깨졌거나 부족하다면, 당신이 가진 최신 정보를 검색하여 위치, 가격, 면적을 채우세요. (단, 사실만 적으세요.)
3. **사용자 거주지와 혼동 금지**: 사용자 프로필(${contextManager.data.fixedInfo.userProfile})은 심사 기준일 뿐, 단지 위치가 아닙니다.

### 📤 응답 JSON
{
  "isMatch": boolean,
  "actualLocation": "검증된 실제 주소",
  "actualPrice": "검증된 실제 가격",
  "actualArea": "검증된 실제 면적",
  "reasoning": "판정 근거",
  "strengths": "입지 강점",
  "cautions": "주의사항"
}
`.trim();

    fs.writeFileSync(reportFile, "");

    for (const targetDate of targetDates) {
        const datePath = targetDate.replace(/-/g, '/');
        const dirPath = path.join(process.cwd(), 'backend/data/downloads/CheongyakHome', datePath);
        if (!fs.existsSync(dirPath)) continue;

        const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.pdf'));
        for (const file of files) {
            const filePath = path.join(dirPath, file);
            const resultDir = path.join(process.cwd(), 'backend/data/results/CheongyakHome', datePath);
            const resultFile = path.join(resultDir, file.replace('.pdf', '.json'));
            
            console.log(`   🔍 [Fact-Check Analysis] ${file}...`);
            
            // 텍스트 추출 (최대한 시도)
            let rawText = "";
            try {
                rawText = execSync(`node extract_text.js "${filePath}"`, { encoding: 'utf8' }).substring(0, 20000);
            } catch(e) { rawText = "텍스트 추출 실패"; }
            
            const fullPrompt = `${systemPrompt}\n\n[분석 대상 단지명] ${file.replace('.pdf', '')}\n[텍스트 데이터]\n${rawText}`;
            const promptPath = path.join(process.cwd(), 'temp_prompt.txt');
            fs.writeFileSync(promptPath, fullPrompt);
            
            let analysis;
            try {
                // -y 옵션을 명시하여 검색 기능을 적극 활용하도록 유도
                const result = execSync(`gemini -y --raw-output < "${promptPath}"`, { encoding: 'utf8' });
                const jsonMatch = result.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    analysis = JSON.parse(jsonMatch[0].replace(/```json/g, '').replace(/```/g, '').trim());
                    fs.writeFileSync(resultFile, JSON.stringify(analysis, null, 2));
                }
            } catch(e) { console.log(`   ⚠️ 분석 오류: ${file}`); }
            if (fs.existsSync(promptPath)) fs.unlinkSync(promptPath);

            if (analysis) {
                // 한 번 더 인간 에이전트(나)가 위치 정보가 누락되었는지 체크하는 방어 로직
                const location = analysis.actualLocation || "확인불가";
                const isMatch = analysis.isMatch ? '✅ 조건부합' : '❌ 조건미달';
                
                const relativePdfPath = `backend/data/downloads/CheongyakHome/${datePath}/${file}`;
                const safePath = relativePdfPath.split('/').map(s => encodeURIComponent(s)).join('/');
                const downloadUrl = `${githubBase}/blob/main/${safePath}?raw=true`;
                
                let entry = `[분석 대상] ${file.replace('.pdf', '')}\n`;
                entry += `• 판정: ${isMatch}\n`;
                entry += `• 위치: ${location}\n`;
                entry += `• 면적: ${analysis.actualArea || "확인불가"}\n`;
                entry += `• 가격: ${analysis.actualPrice || "확인불가"}\n`;
                entry += `• 요약: ${analysis.reasoning || "내용없음"}\n`;
                entry += `• 강점: ${analysis.strengths || "내용없음"}\n`;
                entry += `• 주의: ${analysis.cautions || "내용없음"}\n`;
                entry += `🔗공고문링크: ${downloadUrl}\n\n`;
                fs.appendFileSync(reportFile, entry);
            }
        }
    }
    console.log("✅ [Orchestrator] 분석 완료");
}
orchestrate();
