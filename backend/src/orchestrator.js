const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');
const contextManager = require('./utils/context-manager');

async function orchestrate() {
    console.log("🎯 [Orchestrator] 실사 기반 정밀 분석 가동...");
    const reportFile = 'daily_report.txt';
    const datesJson = JSON.parse(fs.readFileSync('dates.json', 'utf8'));
    const targetDates = [datesJson.d1, datesJson.d2].filter(Boolean);
    const githubBase = contextManager.data.fixedInfo.githubBase;

    // 할루시네이션 방지를 위한 초정밀 프롬프트
    const systemPrompt = `
당신은 대한민국 청약 공고 정밀 분석 AI입니다. 
당신의 목표는 '있는 그대로의 사실'만 전달하는 것입니다.

### ⛔ 절대 엄금 사항 (할루시네이션 방지)
1. 텍스트에 없는 주소, 가격, 면적을 절대 지어내지 마세요.
2. 사용자의 프로필(수원 거주 등)을 보고 단지의 위치를 추측하지 마세요. 
3. 정보가 명확하지 않으면 반드시 "텍스트 내 정보 없음"이라고 답변하세요.

### 📋 분석 및 응답 순서
1단계: 본문에서 '공급위치' 혹은 '사업지 주소'를 찾아 그대로 적으세요.
2단계: 본문에서 '공급금액' 혹은 '분양가' 정보를 찾아 적으세요.
3단계: 전용면적 정보를 찾으세요.
4단계: 사용자의 조건(7억 미만, 45~85㎡)과 비교하여 '적격/부적격'을 판정하세요.

### 📤 응답 JSON 형식
{
  "isMatch": boolean,
  "actualLocation": "본문에서 찾은 실제 주소 (추측금지)",
  "actualPrice": "본문에서 찾은 실제 가격 (추측금지)",
  "actualArea": "본문에서 찾은 실제 면적 (추측금지)",
  "reasoning": "판정 근거 (사실 기반)",
  "strengths": "입지/브랜드 강점 (본문 기반)",
  "cautions": "제한사항/주의점 (본문 기반)"
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
            if (!fs.existsSync(resultDir)) fs.mkdirSync(resultDir, { recursive: true });
            const resultFile = path.join(resultDir, file.replace('.pdf', '.json'));
            
            console.log(`   🔍 [Fact-Checking Analysis] ${file}...`);
            
            // 모든 텍스트를 추출하여 AI에게 제공 (정보 누락 최소화)
            const rawText = execSync(`node extract_text.js "${filePath}"`, { encoding: 'utf8' });
            
            const fullPrompt = `${systemPrompt}\n\n[분석 대상] ${file}\n[공고문 전문]\n${rawText.substring(0, 30000)}`;
            const promptPath = path.join(process.cwd(), 'temp_prompt.txt');
            fs.writeFileSync(promptPath, fullPrompt);
            
            let analysis;
            try {
                // 모델이 충분히 사고할 수 있도록 raw-output 활용
                const result = execSync(`gemini -y --raw-output < "${promptPath}"`, { encoding: 'utf8' });
                const jsonMatch = result.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    analysis = JSON.parse(jsonMatch[0].replace(/```json/g, '').replace(/```/g, '').trim());
                    fs.writeFileSync(resultFile, JSON.stringify(analysis, null, 2));
                }
            } catch(e) { console.log(`   ⚠️ 분석 오류: ${file}`); }
            if (fs.existsSync(promptPath)) fs.unlinkSync(promptPath);

            if (analysis) {
                const statusStr = analysis.isMatch ? '✅ 조건부합' : '❌ 조건미달';
                
                const relativePdfPath = `backend/data/downloads/CheongyakHome/${datePath}/${file}`;
                const safePath = relativePdfPath.split('/').map(s => encodeURIComponent(s)).join('/');
                const downloadUrl = `${githubBase}/blob/main/${safePath}?raw=true`;
                
                let entry = `[분석 대상] ${file.replace('.pdf', '')}\n`;
                entry += `• 판정: ${statusStr}\n`;
                entry += `• 위치: ${analysis.actualLocation || "확인불가"}\n`;
                entry += `• 면적: ${analysis.actualArea || "확인불가"}\n`;
                entry += `• 가격: ${analysis.actualPrice || "확인불가"}\n`;
                entry += `• 요약: ${analysis.reasoning || "확인불가"}\n`;
                entry += `• 강점: ${analysis.strengths || "내용없음"}\n`;
                entry += `• 주의: ${analysis.cautions || "내용없음"}\n`;
                // 링크를 본문에 직접 삽입 (가장 확실한 방법)
                entry += `🔗공고문링크: ${downloadUrl}\n\n`;
                fs.appendFileSync(reportFile, entry);
            }
        }
    }
    console.log("✅ [Orchestrator] 사실 기반 분석 완료");
}
orchestrate();
