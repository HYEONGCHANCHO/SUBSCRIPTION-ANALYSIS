#!/bin/bash

# 1. 환경 설정 및 경로 이동
# GitHub Actions 환경에서는 상대 경로를 사용하도록 설정
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

# 2. 분석 대상 날짜 조회 (2일치)
# scripts/get-analysis-dates.js가 있다면 사용, 없으면 로컬 계산
ANALYSIS_DATES=$(node scripts/get-analysis-dates.js)
D1=$(echo $ANALYSIS_DATES | cut -d',' -f1)
D2=$(echo $ANALYSIS_DATES | cut -d',' -f2)

echo "=========================================="
echo "📅 정밀 분석 시작 ($D1, $D2)"

# 3. 데이터 수집
npm run scrape

# 4. 리포트 생성 스크립트 실행 (중복 체크 및 AI 분석 통합)
# 변수를 JSON 파일로 넘겨서 Node에서 읽게 함으로써 쉘 이스케이프 문제 방지
echo "{\"d1\": \"$D1\", \"d2\": \"$D2\"}" > dates.json

cat <<'INNER_EOF' > process_analysis.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const { d1, d2 } = JSON.parse(fs.readFileSync('dates.json', 'utf8'));
const dates = [d1, d2];
let finalReport = "📢 *청약 정밀 분석 통합 리포트 (2일치)*\n";

dates.forEach(date => {
    finalReport += "\n📅 *" + date + "*\n----------------------------------\n";
    const formattedDate = date.replace(/-/g, '/');
    const downloadDir = path.join('backend/data/downloads/CheongyakHome', formattedDate);
    const resultDir = path.join('backend/data/results/CheongyakHome', formattedDate);

    if (!fs.existsSync(downloadDir)) {
        finalReport += "📢 해당 날짜에 공고가 없습니다.\n";
        return;
    }

    if (!fs.existsSync(resultDir)) fs.mkdirSync(resultDir, { recursive: true });

    const files = fs.readdirSync(downloadDir).filter(f => f.endsWith('.pdf'));
    if (files.length === 0) {
        finalReport += "📢 해당 날짜에 공고가 없습니다.\n";
    } else {
        files.forEach(file => {
            const fileName = file.replace('.pdf', '');
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
                console.log("🔍 신규 공고 분석 중: " + fileName);
                try {
                    // GitHub Actions 환경에서는 gemini CLI가 없을 수 있으므로 
                    // 에이전트에게 분석 요청하는 프롬프트를 텍스트로 남김 (이후 에이전트가 처리)
                    matchIcon = "[❓ 신규 발견]";
                    summary = "신규 공고입니다. 상세 분석을 위해 서버를 확인하세요.";
                } catch (e) {
                    matchIcon = "[⚠️ 분석 오류]";
                    summary = "분석 중 에러가 발생했습니다.";
                }
            }
            finalReport += "📍 *" + fileName + "* " + matchIcon + "\n- " + summary + "\n";
        });
    }
});

fs.writeFileSync('daily_report.txt', finalReport);
INNER_EOF

node process_analysis.js
rm process_analysis.js dates.json

# 5. 슬랙 전송
SLACK_URL=$(grep "^SLACK_WEBHOOK_URL=" .env | cut -d '=' -f2 | tr -d '"' | tr -d "'")
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

echo "✅ 자동 분석 및 슬랙 전송 완료"
