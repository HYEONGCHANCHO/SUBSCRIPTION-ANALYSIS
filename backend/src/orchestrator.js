const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');
const contextManager = require('./utils/context-manager');

async function orchestrate() {
    console.log("🎯 [Orchestrator] 정밀도 강화 분석 시작...");
    const reportFile = 'daily_report.txt';
    const datesJson = JSON.parse(fs.readFileSync('dates.json', 'utf8'));
    const targetDates = [datesJson.d1, datesJson.d2].filter(Boolean);
    const githubBase = contextManager.data.fixedInfo.githubBase;

    // 프롬프트 강화: 사실 추출과 판정 로직 분리
    const systemPrompt = `
당신은 부동산 전문 분석관입니다. 반드시 다음 단계를 거쳐 응답하세요.

1단계 [사실 추출]: PDF 텍스트에서 '사업 위치(주소)', '공급 규모', '분양가'를 있는 그대로 추출하세요. 절대 추측하지 마세요.
2단계 [사용자 매칭]: 추출된 사실을 바탕으로 다음 기준과 대조하세요.
- 사용자 거주지: ${contextManager.data.fixedInfo.userProfile} (이것은 분석 대상의 위치가 아닙니다!)
- 가격 기준: 7억 미만 / 면적 기준: 45~85㎡

3단계 [결과 출력]: 다음 JSON 형식을 엄수하세요.
{
  "isMatch": boolean,
  "위치": "시/군/구 단위 정밀 위치",
  "분양가": "정확한 금액 범위",
  "면적": "전용면적 범위",
  "요약": "장단점 분석",
  "강점": "입지적 메리트",
  "주의사항": "규제 및 주의점"
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
            
            // 위치 정보 오류가 있었으므로 기존 캐시를 강제 무효화하고 재분석
            console.log(`   🔍 [Deep Analysis] ${file} (정밀도 강화)...`);
            
            // 텍스트 추출량 대폭 확대 (20,000자) 및 중요 정보 우선순위
            const text = execSync(`node extract_text.js "${filePath}" | head -c 20000`, { encoding: 'utf8' });
            const fullPrompt = `${systemPrompt}\n\n[분석 대상 파일명] ${file}\n[공고문 본문]\n${text}`;
            
            const promptPath = path.join(process.cwd(), 'temp_prompt.txt');
            fs.writeFileSync(promptPath, fullPrompt);
            
            let analysis;
            try {
                const result = execSync(`gemini -y --raw-output < "${promptPath}"`, { encoding: 'utf8' });
                const jsonMatch = result.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    analysis = JSON.parse(jsonMatch[0].replace(/```json/g, '').replace(/```/g, '').trim());
                    fs.writeFileSync(resultFile, JSON.stringify(analysis, null, 2));
                }
            } catch(e) { console.log(`   ⚠️ 분석 에러: ${file}`); }
            if (fs.existsSync(promptPath)) fs.unlinkSync(promptPath);

            if (analysis) {
                const isMatch = analysis.isMatch === true;
                const statusStr = isMatch ? '✅ 조건부합' : '❌ 조건미달';
                
                // GitHub 링크 (가독성을 위해 카카오 매니저에서 처리하도록 마커 유지)
                const relativePdfPath = `backend/data/downloads/CheongyakHome/${datePath}/${file}`;
                const safePath = relativePdfPath.split('/').map(s => encodeURIComponent(s)).join('/');
                const downloadUrl = `${githubBase}/blob/main/${safePath}?raw=true`;
                
                let entry = `[분석 대상] ${file.replace('.pdf', '')}\n`;
                entry += `• 판정: ${statusStr}\n`;
                entry += `• 위치: ${analysis.위치 || "정보 없음"}\n`;
                entry += `• 정보: ${analysis.면적 || '-'} / ${analysis.분양가 || '-'}\n`;
                entry += `• 요약: ${analysis.요약 || '내용 없음'}\n`;
                entry += `• 강점: ${analysis.강점 || "공고문 참조"}\n`;
                entry += `• 주의: ${analysis.주의사항 || "공고문 참조"}\n`;
                entry += `🔗LINK:${downloadUrl}\n\n`;
                fs.appendFileSync(reportFile, entry);
            }
        }
    }
    console.log("✅ [Orchestrator] 정밀 분석 완료");
}
orchestrate();
