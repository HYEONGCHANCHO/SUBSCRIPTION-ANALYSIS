#!/bin/bash

# 1. 환경 설정
export PATH="$PATH:$(npm config get prefix)/bin"
REPORT_FILE="daily_report.txt"

# 2. 분석 타겟 날짜 확보
ANALYSIS_DATES=$(node scripts/get-analysis-dates.js)
D1=$(echo $ANALYSIS_DATES | cut -d',' -f1)
D2=$(echo $ANALYSIS_DATES | cut -d',' -f2)

echo "🎯 분석 타겟: $D1, $D2"
echo "{\"d1\": \"$D1\", \"d2\": \"$D2\"}" > dates.json

# 3. 데이터 수집
npm run scrape

# 4. 오케스트레이터 실행 (에이전트 스킬 및 캐시 활용)
echo "🤖 오케스트레이터 분석 가동..."
node backend/src/orchestrator.js

# 5. 카카오톡 전송 (지능형 리포터 스킬)
if [ -f "kakao_manager.js" ] && [ -f "$REPORT_FILE" ]; then
    echo "📲 카카오톡 리포트 전송 중..."
    REPORT_CONTENT=$(cat "$REPORT_FILE")
    YEAR=$(date +%Y); MONTH=$(date +%m); DAY=$(date +%d)
    RESULT_FOLDER_LINK="https://github.com/HYEONGCHANCHO/SUBSCRIPTION-ANALYSIS/tree/main/backend/data/results/CheongyakHome/$YEAR/$MONTH/$DAY/"
    node kakao_manager.js send "$REPORT_CONTENT" "$RESULT_FOLDER_LINK"
fi
