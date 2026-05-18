#!/bin/bash

# 1. 환경 설정
export PATH="$PATH:$(npm config get prefix)/bin"

# 2. 날짜 조회
ANALYSIS_DATES=$(node scripts/get-analysis-dates.js)
D1=$(echo $ANALYSIS_DATES | cut -d',' -f1)
D2=$(echo $ANALYSIS_DATES | cut -d',' -f2)

echo "🎯 분석 대상: $D1, $D2"
echo "{\"d1\": \"$D1\", \"d2\": \"$D2\"}" > dates.json

# 3. 데이터 수집 및 분석 (4월 27일 방식: main.ts 실행)
# 이 과정에서 복원된 HomeScraper와 Analyzer가 작동합니다.
npm start

# 4. 슬랙 전송 (daily_report.txt 생성을 위해 간단한 스크립트 실행)
# Analyzer의 결과를 바탕으로 리포트를 생성하는 과정은 main.ts에서 처리되거나 
# 아래에서 간단히 daily_report.txt를 만들어 전송합니다.

SLACK_URL=$(grep "^SLACK_WEBHOOK_URL=" .env | cut -d '=' -f2)
if [ -z "$SLACK_URL" ]; then
    SLACK_URL=$SLACK_WEBHOOK_URL
fi

if [ -n "$SLACK_URL" ] && [ -f "daily_report.txt" ]; then
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
