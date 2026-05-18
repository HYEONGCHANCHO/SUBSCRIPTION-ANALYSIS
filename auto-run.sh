#!/bin/bash

# 1. 환경 설정
export PATH="$PATH:$(npm config get prefix)/bin"

# 2. 날짜 조회
ANALYSIS_DATES=$(node scripts/get-analysis-dates.js)
D1=$(echo $ANALYSIS_DATES | cut -d',' -f1)
D2=$(echo $ANALYSIS_DATES | cut -d',' -f2)

echo "🎯 분석 대상: $D1, $D2"
echo "{\"d1\": \"$D1\", \"d2\": \"$D2\"}" > dates.json

# 3. 데이터 수집
npm run scrape

# 4. 에이전트 직접 분석(CLI 활용) 루프
echo "🤖 에이전트 정밀 분석 시작..."
REPORT_FILE="daily_report.txt"
echo "📢 *청약 통합 정밀 분석 리포트 (에이전트 직접 분석)*" > $REPORT_FILE
echo "" >> $REPORT_FILE

# 수집된 모든 PDF 파일에 대해 분석 수행
find backend/data/downloads -name "*.pdf" | while read -r file; do
    FILENAME=$(basename "$file")
    DIRNAME=$(dirname "$file")
    RESULT_DIR="${DIRNAME/downloads/results}"
    mkdir -p "$RESULT_DIR"
    
    # 이미 분석된 파일인지 확인
    if [ -f "$RESULT_DIR/$FILENAME.json" ] || [ -f "$RESULT_DIR/[조건 미부합] $FILENAME.json" ]; then
        echo "   ✅ 이미 분석됨: $FILENAME"
        continue
    fi

    echo "   🔍 분석 중: $FILENAME"
    
    # 텍스트 추출
    TEXT=$(node extract_text.js "$file" | head -c 10000)
    
    # Gemini CLI를 이용한 에이전트급 분석 요청
    PROMPT="당신은 부동산 전문 AI 에이전트입니다. 아래 공고문 텍스트를 'analysis-config.md' 기준(수원 거주, 무주택, 청년)에 따라 분석하여 반드시 순수 JSON만 출력하세요.
    
    텍스트: $TEXT"
    
    ANALYSIS_JSON=$(gemini "$PROMPT" --silent)
    
    # 결과 저장 (JSON 정합성 체크 후 저장)
    if echo "$ANALYSIS_JSON" | grep -q "{"; then
        IS_MATCH=$(echo "$ANALYSIS_JSON" | grep -o '"isMatch": *true' | head -1)
        if [ -n "$IS_MATCH" ]; then
            SAVE_PATH="$RESULT_DIR/$FILENAME.json"
            MATCH_ICON="✅"
        else
            SAVE_PATH="$RESULT_DIR/[조건 미부합] $FILENAME.json"
            MATCH_ICON="❌"
        fi
        echo "$ANALYSIS_JSON" > "$SAVE_PATH"
        
        # 리포트 요약 추가
        SUMMARY=$(echo "$ANALYSIS_JSON" | grep -o '"summary": *"[^"]*"' | cut -d'"' -f4)
        echo "🏠 *${FILENAME%.*}* $MATCH_ICON" >> $REPORT_FILE
        echo "- $SUMMARY" >> $REPORT_FILE
        echo "" >> $REPORT_FILE
        echo "   └ 분석 완료: $MATCH_ICON"
    else
        echo "   ⚠️ 분석 실패: $FILENAME"
    fi
done

# 5. 슬랙 전송
SLACK_URL=$(grep "^SLACK_WEBHOOK_URL=" .env | cut -d '=' -f2)
[ -z "$SLACK_URL" ] && SLACK_URL=$SLACK_WEBHOOK_URL

if [ -n "$SLACK_URL" ] && [ -f "$REPORT_FILE" ]; then
    node -e "
    const https = require('https');
    const fs = require('fs');
    const content = fs.readFileSync('$REPORT_FILE', 'utf8');
    const payload = JSON.stringify({ text: content });
    const url = new URL('$SLACK_URL');
    const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    };
    const req = https.request(options, (res) => console.log('Slack response:', res.statusCode));
    req.on('error', (e) => console.error('Slack error:', e));
    req.write(payload);
    req.end();
    "
fi
