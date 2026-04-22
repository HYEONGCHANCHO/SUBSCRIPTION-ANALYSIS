const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const pdf = require('pdf-parse');
const https = require('https');

async function main() {
    // 1. 날짜 범위 2일로 축소
    const datesData = JSON.parse(fs.readFileSync('dates.json', 'utf8'));
    const dates = [datesData.d1, datesData.d2].filter(Boolean);

    const logPath = 'backend/data/logs/analysis.log';
    if (!fs.existsSync('backend/data/logs')) fs.mkdirSync('backend/data/logs', { recursive: true });

    function log(msg) {
        const timestamp = new Date().toISOString();
        const line = "[" + timestamp + "] " + msg + "\n";
        fs.appendFileSync(logPath, line);
        console.log(msg);
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function extractRelevantText(filePath) {
        if (!filePath.toLowerCase().endsWith('.pdf')) return null;
        try {
            const dataBuffer = fs.readFileSync(filePath);
            const data = await pdf(dataBuffer);
            const fullText = data.text;
            
            const keywords = [
                '공급대상', '공급규모', '공급금액', '분양가', '임대보증금', '월임대료', 
                '신청자격', '입주자 선정', '당첨자 발표', '청약일정', '전용면적', 
                '전매제한', '거주의무', '재당첨', '특별공급', '일반공급',
                '입주예정', '위치', '입지', '사업명', '단지명'
            ];
            
            const lines = fullText.split('\n');
            const filteredLines = [];
            let contextBuffer = [];

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line.length < 5) continue;

                const hasKeyword = keywords.some(k => line.includes(k));
                if (hasKeyword) {
                    const start = Math.max(0, i - 2);
                    const end = Math.min(lines.length, i + 3);
                    for (let j = start; j < end; j++) {
                        const l = lines[j].trim();
                        if (!contextBuffer.includes(l)) contextBuffer.push(l);
                    }
                }
                
                if (contextBuffer.length > 50) {
                    filteredLines.push(...contextBuffer);
                    contextBuffer = [];
                }
            }
            filteredLines.push(...contextBuffer);

            // 토큰 절약을 위해 3500자로 더 제한
            const result = filteredLines.join('\n').substring(0, 3500);
            log("      ✅ PDF 텍스트 추출 완료 (토큰 최적화: 3500자 제한)");
            return result;
        } catch (e) {
            log("      ⚠️ PDF 텍스트 추출 실패: " + e.message);
            return null;
        }
    }

    function heuristicAnalysis(text, site) {
        if (!text) return null;
        const areaMatch = text.match(/(\d{2,3}(?:\.\d+)?)\s*㎡/);
        const area = areaMatch ? parseFloat(areaMatch[1]) : null;

        let price = null;
        const priceEokMatch = text.match(/(\d{1,2}(?:\.\d+)?)\s*억원/);
        const priceManMatch = text.match(/(\d{4,9}(?:,\d{3})*)\s*만원/);
        if (priceEokMatch) price = parseFloat(priceEokMatch[1]) * 100000000;
        else if (priceManMatch) price = parseInt(priceManMatch[1].replace(/,/g, '')) * 10000;

        let isMatch = true;
        let reasons = [];

        if (area && (area < 45 || area > 85)) {
            isMatch = false;
            reasons.push("면적 기준 미달 (" + area + "㎡)");
        }
        if (price && price > 700000000) {
            isMatch = false;
            reasons.push("분양가 기준 초과 (" + (price/100000000).toFixed(1) + "억)");
        }

        return {
            isMatch,
            summary: "[🔢 약식 분석] " + (isMatch ? "✅ 조건 충족 추정" : "❌ 조건 미달: " + reasons.join(', ')) + 
                     " (면적: " + (area || "미파악") + "㎡, 가격: " + (price ? (price/100000000).toFixed(1) + "억" : "미파악") + ")",
            isHeuristic: true
        };
    }

    log("🚀 분석 프로세스 시작 (2영업일 대상, 토큰 최적화 적용)");
    let finalReport = "📢 *청약 정밀 분석 통합 리포트 (KST 2영업일)*\n";

    for (const date of dates) {
        log("📅 날짜 처리 중: " + date);
        finalReport += "\n📅 *" + date + "*\n----------------------------------\n";
        const formattedDate = date.replace(/-/g, '/');
        const sites = ['CheongyakHome', 'LH'];
        
        for (const site of sites) {
            const downloadDir = path.join('backend/data/downloads', site, formattedDate);
            const resultDir = path.join('backend/data/results', site, formattedDate);

            if (!fs.existsSync(downloadDir)) continue;
            if (!fs.existsSync(resultDir)) fs.mkdirSync(resultDir, { recursive: true });

            const files = fs.readdirSync(downloadDir).filter(f => f.endsWith('.pdf') || f.endsWith('.hwpx') || f.endsWith('.hwp'));
            
            if (files.length === 0) {
                finalReport += "📍 (" + site + ") 해당 일자 공고 없음\n";
                continue;
            }

            for (const file of files) {
                const fileName = path.parse(file).name;
                const resPath = path.join(resultDir, fileName + '.json');
                const failPath = path.join(resultDir, '[조건 미부합] ' + fileName + '.json');
                
                let summary = "";
                let matchIcon = "";

                // 중복 체크: 이미 결과가 있다면 스킵 (토큰 절약 핵심)
                if (fs.existsSync(resPath)) {
                    try {
                        const data = JSON.parse(fs.readFileSync(resPath, 'utf8'));
                        matchIcon = (data.isHeuristic ? "[✅ 약식 통과]" : "[✅ 조건 부합]");
                        summary = formatSummary(data.summary);
                        log("   ✅ 기존 결과 활용 (성공): " + fileName);
                        summary += addOriginLink(downloadDir, file);
                    } catch(e) { matchIcon = "[⚠️ 데이터 오류]"; }
                } else if (fs.existsSync(failPath)) {
                    try {
                        const data = JSON.parse(fs.readFileSync(failPath, 'utf8'));
                        matchIcon = "[❌ 조건 미달]";
                        summary = data.summary || "요약 정보 없음";
                        log("   ❌ 기존 결과 활용 (탈락): " + fileName);
                    } catch(e) { matchIcon = "[⚠️ 데이터 오류]"; }
                } else {
                    log("   🔍 신규 분석 시작: " + fileName);
                    const filePath = path.join(downloadDir, file);
                    const extractedText = await extractRelevantText(filePath);
                    
                    try {
                        await sleep(5000); // 대기 시간 단축 (유료 티어/Flash 모델 대응)
                        const prompt = `청약 공고 전문가로서 아래 텍스트 분석. JSON으로만 답해.
필수 필드: matchedTypes, eligibility, summary(아래 5개 항목 포함)
1. location_analysis: 상세 주소 및 인프라
2. transportation_analysis: 동천역/강남역(월 08시) 대중교통 소요시간
3. market_analysis: 주변 시세, 안전마진, 호재
4. eligibility_criteria_analysis: 실거주, 수원 무주택 조건
5. other_features: 단지 특징

[텍스트]
${extractedText || "파일 내용을 분석해줘."}`;
                        
                        const safePrompt = prompt.replace(/"/g, '\\"').replace(/`/g, '\\`');
                        const cmd = `gemini -m gemini-2.0-flash "${safePrompt}"`;
                        
                        log("      - Gemini 2.0 Flash 요청 중...");
                        const output = execSync(cmd, { encoding: 'utf8', timeout: 180000 });
                        
                        let cleanOutput = output.replace(/```json|```/g, '').trim();
                        const jsonMatch = cleanOutput.match(/\{[\s\S]*\}/);
                        if (jsonMatch) {
                            const result = JSON.parse(jsonMatch[0]);
                            const isMatch = result.isMatch === true || result.eligibility === 'eligible' || result.eligibility === 'PASSED' || result.eligibility === 'PASS';
                            matchIcon = isMatch ? "[✅ 조건 부합]" : "[❌ 조건 미달]";
                            summary = formatSummary(result.summary);
                            
                            const savePath = isMatch ? resPath : failPath;
                            fs.writeFileSync(savePath, JSON.stringify(result, null, 2));
                            if (isMatch) summary += addOriginLink(downloadDir, file);
                            log("      - 분석 성공: " + matchIcon);
                        } else { throw new Error("JSON Parsing Failed"); }
                    } catch (e) {
                        log("      ❌ AI 실패 -> 약식 분석 전환: " + e.message);
                        const result = heuristicAnalysis(extractedText, site);
                        if (result) {
                            const isMatch = result.isMatch;
                            matchIcon = isMatch ? "[✅ 약식 통과]" : "[❌ 약식 탈락]";
                            summary = result.summary;
                            fs.writeFileSync(isMatch ? resPath : failPath, JSON.stringify(result, null, 2));
                            if (isMatch) summary += addOriginLink(downloadDir, file);
                        } else {
                            matchIcon = "[⚠️ 분석 실패]";
                            summary = "분석 실패 (파일 확인 필요)";
                        }
                    }
                }
                finalReport += "📍 *" + fileName + "* " + matchIcon + "\n- " + summary + "\n";
            }
        }
    }

    log("✅ 모든 분석 완료");
    fs.writeFileSync('daily_report.txt', finalReport);

    function formatSummary(sum) {
        if (sum && typeof sum === 'object') {
            const lines = [];
            if (sum.location_analysis) lines.push(`- 📍 *입지:* ${sum.location_analysis}`);
            if (sum.transportation_analysis) lines.push(`- 🚗 *교통:* ${sum.transportation_analysis}`);
            if (sum.market_analysis) lines.push(`- 💰 *시세:* ${sum.market_analysis}`);
            if (sum.eligibility_criteria_analysis) lines.push(`- ✅ *자격:* ${sum.eligibility_criteria_analysis}`);
            if (sum.other_features) lines.push(`- ✨ *특징:* ${sum.other_features}`);
            return lines.join('\n');
        }
        return sum || "요약 정보 없음";
    }

    function addOriginLink(dir, file) {
        const baseUrl = "https://github.com/HYEONGCHANCHO/SUBSCRIPTION-ANALYSIS/blob/main/";
        const encodedPath = path.join(dir, file).split(path.sep).map(p => encodeURIComponent(p)).join('/');
        return `\n   👉 <${baseUrl}${encodedPath}|📄 *공고문 원본 보기*>`;
    }
}

main().catch(error => {
    console.error("🔥 Fatal error:", error);
    process.exit(1);
});
