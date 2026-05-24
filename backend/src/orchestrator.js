const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');
const contextManager = require('./utils/context-manager');

async function orchestrate() {
    console.log("🎯 [Orchestrator] 패턴 기반 지능형 분석 시작...");
    const reportFile = 'daily_report.txt';
    const datesJson = JSON.parse(fs.readFileSync('dates.json', 'utf8'));
    const targetDates = [datesJson.d1, datesJson.d2].filter(Boolean);
    const githubBase = contextManager.data.fixedInfo.githubBase;

    const systemPrompt = `
당신은 대한민국 청약 공고 전문 분석관입니다. 
제공된 텍스트는 공고문의 핵심 섹션(공급안내, 가격, 자격요건)만 추출한 것입니다.

[필수 추출 항목]
1. 위치: 지번 주소를 포함한 정확한 사업지 위치
2. 분양가: 모집공고 상의 정확한 분양가(최고가 기준 권장)
3. 면적: 전용면적(㎡) 리스트
4. 자격요건: 거주지역 제한, 무주택 요건, 재당첨 제한 여부

[심사 기준]
- 사용자: ${contextManager.data.fixedInfo.userProfile}
- 기준: 7억 미만, 45~85㎡

반드시 다음 JSON 형식으로만 응답하세요:
{
  "isMatch": boolean,
  "위치": "주소",
  "분양가": "가격정보",
  "면적": "면적정보",
  "요약": "한줄평",
  "강점": "입지강점",
  "주의사항": "규제사항"
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
            
            console.log(`   🔍 [Intelligent Analysis] ${file}...`);
            
            // 패턴 기반 지능형 추출: 전체를 읽지 않고 핵심 키워드 주변을 추출
            const rawText = execSync(`node extract_text.js "${filePath}"`, { encoding: 'utf8' });
            
            // 청약 공고문 표준 패턴 매칭
            const sections = [];
            const keywords = ["공급위치", "공급규모", "공급금액", "신청자격", "당첨자발표", "입주예정"];
            
            keywords.forEach(kw => {
                const idx = rawText.indexOf(kw);
                if (idx !== -1) {
                    // 키워드 발견 시 앞뒤 2000자씩 추출 (표 데이터가 보통 뒤에 옴)
                    sections.push(`--- ${kw} 관련 섹션 ---\n` + rawText.substring(Math.max(0, idx - 100), idx + 3000));
                }
            });

            // 만약 키워드 추출 실패 시 상단 1만자 폴백
            const intelligentText = sections.length > 0 ? sections.join("\n\n") : rawText.substring(0, 10000);
            
            const fullPrompt = `${systemPrompt}\n\n[분석 대상] ${file}\n[핵심 텍스트]\n${intelligentText}`;
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
            } catch(e) {}
            if (fs.existsSync(promptPath)) fs.unlinkSync(promptPath);

            if (analysis) {
                const isMatch = analysis.isMatch === true;
                const statusStr = isMatch ? '✅ 조건부합' : '❌ 조건미달';
                
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
    console.log("✅ [Orchestrator] 패턴 분석 완료");
}
orchestrate();
