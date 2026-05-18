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

# 4. 에이전트 직접 분석 (Gemini CLI Headless 모드)
echo "🤖 에이전트 정밀 분석 시작..."
REPORT_FILE="daily_report.txt"
CONFIG_CONTENT=$(cat analysis-config.md)

echo "📢 *청약 통합 정밀 분석 리포트 (에이전트 직접 분석)*" > $REPORT_FILE
echo "" >> $REPORT_FILE

find backend/data/downloads -name "*.pdf" | while read -r file; do
    FILENAME=$(basename "$file")
    DIRNAME=$(dirname "$file")
    RESULT_DIR="${DIRNAME/downloads/results}"
    mkdir -p "$RESULT_DIR"
    
    echo "   🔍 분석 중: $FILENAME"
    
    # 텍스트 추출
    TEXT=$(node extract_text.js "$file" | head -c 12000)
    
    # Gemini CLI 실행 (Headless)
    PROMPT="당신은 전문 부동산 에이전트입니다. 아래의 분석 기준과 공고문 텍스트를 바탕으로 분석하여 반드시 순수 JSON만 출력하세요. 
    
    [분석 기준]
    $CONFIG_CONTENT
    
    [공고문 텍스트]
    $TEXT"
    
    # -p 옵션으로 프롬프트 전달, -y로 자동 승인
    ANALYSIS_JSON=$(gemini -p "$PROMPT" -y --raw-output)
    
    # JSON 추출 (마크다운 코드 블록 제거)
    CLEAN_JSON=$(echo "$ANALYSIS_JSON" | sed -n '/{/,/}/p' | sed 's/```json//g; s/```//g')
    
    if [ -n "$CLEAN_JSON" ]; then
        IS_MATCH=$(echo "$CLEAN_JSON" | grep -o '"isMatch": *true' | head -1)
        if [ -n "$IS_MATCH" ]; then
            SAVE_PATH="$RESULT_DIR/$FILENAME.json"
            MATCH_ICON="✅"
        else
            SAVE_PATH="$RESULT_DIR/[조건 미부합] $FILENAME.json"
            MATCH_ICON="❌"
        fi
        echo "$CLEAN_JSON" > "$SAVE_PATH"
        
        # 요약 정보 추출 및 리포트 추가
        SUMMARY=$(echo "$CLEAN_JSON" | grep -o '"summary": *"[^"]*"' | head -1 | cut -d'"' -f4)
        [ -z "$SUMMARY" ] && SUMMARY="분석 완료 (상세 내용 JSON 참조)"
        
        echo "🏠 *${FILENAME%.*}* $MATCH_ICON" >> $REPORT_FILE
        echo "- $SUMMARY" >> $REPORT_FILE
        echo "" >> $REPORT_FILE
        echo "   └ 분석 완료: $MATCH_ICON"
    else
        echo "   ⚠️ 분석 실패: $FILENAME (응답 오류)"
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
