#!/bin/bash

# 1. 환경 설정
export PATH="$PATH:$(npm config get prefix)/bin"

# 2. 날짜 조회 (주중 3영업일)
ANALYSIS_DATES=$(node scripts/get-analysis-dates.js)
D1=$(echo $ANALYSIS_DATES | cut -d',' -f1)
D2=$(echo $ANALYSIS_DATES | cut -d',' -f2)
D3=$(echo $ANALYSIS_DATES | cut -d',' -f3)

echo "🎯 분석 대상: $D1, $D2, $D3"

# 3. 데이터 수집 (청약홈 + LH)
# 최적화된 스크래퍼 실행 (타겟 날짜만 수집)
npm run scrape

# 4. 리포트 생성 (중복 체크 및 AI 분석 통합)
echo "{\"d1\": \"$D1\", \"d2\": \"$D2\", \"d3\": \"$D3\"}" > dates.json

cat <<'INNER_EOF' > process_analysis.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const pdf = require('pdf-parse'); // pdf-parse 활용

const { d1, d2, d3 } = JSON.parse(fs.readFileSync('dates.json', 'utf8'));
const dates = [d1, d2, d3];
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

// PDF에서 유의미한 텍스트만 추출하는 함수
async function extractRelevantText(filePath) {
    if (!filePath.toLowerCase().endsWith('.pdf')) return null;
    try {
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdf(dataBuffer);
        const fullText = data.text;
        
        // 핵심 키워드 정의 (공고문의 핵심 정보를 포함하는 문장/문단만 추출)
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
                // 키워드 발견 시 앞뒤 2문장씩 포함하여 문맥 유지
                const start = Math.max(0, i - 2);
                const end = Math.min(lines.length, i + 3);
                for (let j = start; j < end; j++) {
                    const l = lines[j].trim();
                    if (!contextBuffer.includes(l)) contextBuffer.push(l);
                }
            }
            
            // 버퍼가 너무 커지면 중간에 한번씩 비워줌 (중복 방지 및 토큰 절약)
            if (contextBuffer.length > 50) {
                filteredLines.push(...contextBuffer);
                contextBuffer = [];
            }
        }
        filteredLines.push(...contextBuffer);

        // 최대 4000자 정도로 제한 (AI 분석에 충분한 정보량)
        const result = filteredLines.join('\n').substring(0, 4500);
        log("      ✅ PDF 텍스트 추출 완료 (원본 대비 약 " + Math.round((result.length / fullText.length) * 100) + "% 크기)");
        return result;
    } catch (e) {
        log("      ⚠️ PDF 텍스트 추출 실패: " + e.message);
        return null;
    }
}

// 로컬 약식 분석 함수 (AI 실패 시 Fallback)
function heuristicAnalysis(text, site) {
    if (!text) return null;
    
    // 1. 면적 추출 (㎡)
    const areaMatch = text.match(/(\d{2,3}(?:\.\d+)?)\s*㎡/);
    const area = areaMatch ? parseFloat(areaMatch[1]) : null;

    // 2. 가격 추출 (억원/만원)
    let price = null;
    const priceEokMatch = text.match(/(\d{1,2}(?:\.\d+)?)\s*억원/);
    const priceManMatch = text.match(/(\d{4,9}(?:,\d{3})*)\s*만원/);
    if (priceEokMatch) price = parseFloat(priceEokMatch[1]) * 100000000;
    else if (priceManMatch) price = parseInt(priceManMatch[1].replace(/,/g, '')) * 10000;

    // 3. 필터링 규칙 적용 (Config 기준)
    let isMatch = true;
    let reasons = [];

    if (area) {
        if (area < 45 || area > 85) {
            isMatch = false;
            reasons.push("면적 기준 미달 (" + area + "㎡)");
        }
    }
    if (price) {
        if (price > 700000000) { // 7억 초과
            isMatch = false;
            reasons.push("분양가 기준 초과 (" + (price/100000000).toFixed(1) + "억)");
        }
    }

    return {
        isMatch,
        summary: "[🔢 약식 분석] " + (isMatch ? "✅ 조건 충족 추정" : "❌ 조건 미달: " + reasons.join(', ')) + 
                 " (면적: " + (area || "미파악") + "㎡, 가격: " + (price ? (price/100000000).toFixed(1) + "억" : "미파악") + ")",
        isHeuristic: true
    };
}

async function run() {
    log("🚀 분석 프로세스 시작 (3영업일 대상, AI + 약식 분석 하이브리드 적용)");
    let finalReport = "📢 *청약 정밀 분석 통합 리포트 (KST 3영업일)*\n";

    for (const date of dates) {
        log("📅 날짜 처리 중: " + date);
        finalReport += "\n📅 *" + date + "*\n----------------------------------\n";
        const formattedDate = date.replace(/-/g, '/');
        const sites = ['CheongyakHome', 'LH'];
        
        for (const site of sites) {
            const downloadDir = path.join('backend/data/downloads', site, formattedDate);
            const resultDir = path.join('backend/data/results', site, formattedDate);

            if (!fs.existsSync(downloadDir)) {
                log("   - [" + site + "] 다운로드 폴더 없음: " + downloadDir);
                continue;
            }
            if (!fs.existsSync(resultDir)) fs.mkdirSync(resultDir, { recursive: true });

            const files = fs.readdirSync(downloadDir).filter(f => f.endsWith('.pdf') || f.endsWith('.hwpx') || f.endsWith('.hwp'));
            
            if (files.length === 0) {
                log("   - [" + site + "] 해당 일자 공고 파일 없음");
                finalReport += "📍 (" + site + ") 해당 일자 공고 없음\n";
                continue;
            }

            for (const file of files) {
                const fileName = path.parse(file).name;
                const resPath = path.join(resultDir, fileName + '.json');
                const failPath = path.join(resultDir, '[조건 미부합] ' + fileName + '.json');
                
                let summary = "";
                let matchIcon = "";

                if (fs.existsSync(resPath)) {
                    try {
                        const data = JSON.parse(fs.readFileSync(resPath, 'utf8'));
                        matchIcon = "[✅ 조건 부합]";
                        summary = data.summary || "요약 정보 없음";
                        log("   ✅ 기존 결과 활용 (성공): " + fileName);
                    } catch(e) { matchIcon = "[⚠️ 데이터 오류]"; log("   ❌ JSON 파싱 에러: " + fileName); }
                } else if (fs.existsSync(failPath)) {
                    try {
                        const data = JSON.parse(fs.readFileSync(failPath, 'utf8'));
                        matchIcon = "[❌ 조건 미달]";
                        summary = data.summary || "요약 정보 없음";
                        log("   ❌ 기존 결과 활용 (탈락): " + fileName);
                    } catch(e) { matchIcon = "[⚠️ 데이터 오류]"; log("   ❌ JSON 파싱 에러: " + fileName); }
                } else {
                    log("   🔍 신규 분석 시작: " + fileName + " (" + site + ")");
                    const filePath = path.join(downloadDir, file);
                    const extractedText = await extractRelevantText(filePath);
                    let result = null;

                    try {
                        // 1. AI 정밀 분석 시도
                        log("      - 10초 대기 중... (Rate Limit 방지)");
                        await sleep(10000);

                        let prompt = "";
                        if (extractedText) {
                            prompt = "청약 공고문 텍스트 분석: " + extractedText + "\n\nJSON 결과만 출력해.";
                        } else {
                            prompt = "파일 '" + filePath + "' 분석: JSON 결과만 출력해.";
                        }
                        
                        const safePrompt = prompt.replace(/"/g, '\\"').replace(/`/g, '\\`');
                        const cmd = "gemini \"" + safePrompt + "\"";
                        
                        log("      - Gemini 분석 요청 중...");
                        const output = execSync(cmd, { encoding: 'utf8', timeout: 120000 });
                        
                        let cleanOutput = output.replace(/```json|```/g, '').trim();
                        const jsonMatch = cleanOutput.match(/\{[\s\S]*\}/);
                        if (jsonMatch) {
                            result = JSON.parse(jsonMatch[0]);
                            result.isHeuristic = false;
                        }
                    } catch (e) {
                        log("      ⚠️ AI 분석 실패, 약식 분석으로 전환: " + e.message);
                        // 2. AI 실패 시 로컬 약식 분석 실행
                        result = heuristicAnalysis(extractedText, site);
                    }

                    if (result) {
                        const isMatch = result.isMatch === true || result.eligibility === 'eligible' || result.eligibility === 'PASSED';
                        matchIcon = isMatch ? (result.isHeuristic ? "[✅ 약식 통과]" : "[✅ 조건 부합]") : (result.isHeuristic ? "[❌ 약식 탈락]" : "[❌ 조건 미달]");
                        summary = result.summary || "분석 완료";
                        const savePath = isMatch ? resPath : failPath;
                        fs.writeFileSync(savePath, JSON.stringify(result, null, 2));
                        log("      - 분석 완료: " + matchIcon);
                    } else {
                        matchIcon = "[⚠️ 분석 실패]";
                        summary = "AI 및 약식 분석 모두 실패 (파일 확인 필요)";
                    }
                }
                finalReport += "📍 *" + fileName + "* " + matchIcon + "\n- " + summary + "\n";
            }
        }
    }

    log("✅ 분석 프로세스 완료");
    fs.writeFileSync('daily_report.txt', finalReport);
}

run().catch(e => {
    log("🔥 전역 오류 발생: " + e.message);
    process.exit(1);
});
INNER_EOF

node process_analysis.js
rm process_analysis.js dates.json

# 5. 슬랙 전송
# .env 파일에서 SLACK_WEBHOOK_URL을 읽어오기 (직접 대입 대신)
SLACK_URL=$(grep "^SLACK_WEBHOOK_URL=" .env | cut -d '=' -f2)
if [ -z "$SLACK_URL" ]; then
    # 환경변수에서 직접 시도 (GitHub Action 환경)
    SLACK_URL=$SLACK_WEBHOOK_URL
fi

if [ -n "$SLACK_URL" ]; then
    node -e "
    const https = require('https');
    const fs = require('fs');
    const content = fs.readFileSync('daily_report.txt', 'utf8');
    const payload = JSON.stringify({ text: content });
    const url = new URL('$SLACK_URL');
    const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    };
    const req = https.request(options, (res) => {
        console.log('Slack response:', res.statusCode);
    });
    req.on('error', (e) => console.error('Slack error:', e));
    req.write(payload);
    req.end();
    "
fi
