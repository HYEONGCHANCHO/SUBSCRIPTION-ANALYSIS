#!/bin/bash

# 1. 환경 설정
export PATH="$PATH:$(npm config get prefix)/bin"

# 2. 날짜 조회 (2일치)
ANALYSIS_DATES=$(node scripts/get-analysis-dates.js)
D1=$(echo $ANALYSIS_DATES | cut -d',' -f1)
D2=$(echo $ANALYSIS_DATES | cut -d',' -f2)

echo "🎯 분석 대상: $D1, $D2"

# 3. 데이터 수집 (청약홈 + LH)
npm run scrape

# 4. 리포트 생성 (중복 체크 및 AI 분석 통합)
echo "{\"d1\": \"$D1\", \"d2\": \"$D2\"}" > dates.json

cat <<'INNER_EOF' > process_analysis.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const { d1, d2 } = JSON.parse(fs.readFileSync('dates.json', 'utf8'));
const dates = [d1, d2];
let finalReport = "📢 *청약 정밀 분석 통합 리포트 (KST 2일치)*\n";

dates.forEach(date => {
    finalReport += "\n📅 *" + date + "*\n----------------------------------\n";
    const formattedDate = date.replace(/-/g, '/');
    const sites = ['CheongyakHome', 'LH'];
    
    sites.forEach(site => {
        const downloadDir = path.join('backend/data/downloads', site, formattedDate);
        const resultDir = path.join('backend/data/results', site, formattedDate);

        if (!fs.existsSync(downloadDir)) return;
        if (!fs.existsSync(resultDir)) fs.mkdirSync(resultDir, { recursive: true });

        const files = fs.readdirSync(downloadDir).filter(f => f.endsWith('.pdf') || f.endsWith('.hwpx'));
        files.forEach(file => {
            const fileName = path.parse(file).name;
            const resPath = path.join(resultDir, fileName + '.json');
            const failPath = path.join(resultDir, '[조건 미부합] ' + fileName + '.json');
            
            let summary = "";
            let matchIcon = "";

            if (fs.existsSync(resPath)) {
                const data = JSON.parse(fs.readFileSync(resPath, 'utf8'));
                matchIcon = "[✅ 조건 부합]";
                summary = data.summary;
            } else if (fs.existsSync(failPath)) {
                const data = JSON.parse(fs.readFileSync(failPath, 'utf8'));
                matchIcon = "[❌ 조건 미달]";
                summary = data.summary;
            } else {
                console.log("🔍 분석 시작: " + fileName);
                try {
                    // 깃헙 액션에서도 gemini 명령어를 통해 직접 정밀 분석 수행
                    const prompt = "파일 '" + path.join(downloadDir, file) + "'의 내용을 'analysis-config.md' 기준으로 정밀 분석해서 결과를 JSON으로 출력해줘. 결과는 반드시 matchedTypes, eligibility, summary 등을 포함해야 해. 다른 부연 설명 없이 JSON만 출력해.";
                    const output = execSync("gemini \"" + prompt + "\"", { encoding: 'utf8' });
                    
                    // JSON만 추출하여 저장 시도
                    const jsonMatch = output.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        const result = JSON.parse(jsonMatch[0]);
                        matchIcon = result.isMatch ? "[✅ 조건 부합]" : "[❌ 조건 미달]";
                        summary = result.summary;
                        const savePath = result.isMatch ? resPath : failPath;
                        fs.writeFileSync(savePath, JSON.stringify(result, null, 2));
                    } else {
                        throw new Error("Invalid output");
                    }
                } catch (e) {
                    matchIcon = "[⚠️ 분석 대기]";
                    summary = "신규 공고 분석 대기 중 (로그 확인 필요)";
                }
            }
            finalReport += "📍 *" + fileName + "* (" + site + ") " + matchIcon + "\n- " + summary + "\n";
        });
    });
});

fs.writeFileSync('daily_report.txt', finalReport);
INNER_EOF

node process_analysis.js
rm process_analysis.js dates.json

# 5. 슬랙 전송
SLACK_URL=$(grep "^SLACK_WEBHOOK_URL=" .env | cut -d '=' -f2)
if [ -n "$SLACK_URL" ]; then
    node -e "
    const https = require('https');
    const fs = require('fs');
    const content = fs.readFileSync('daily_report.txt', 'utf8');
    const req = https.request('$SLACK_URL', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    req.write(JSON.stringify({ text: content }));
    req.end();
    "
fi
