#!/bin/bash

# 1. 환경 설정
export PATH="$PATH:$(npm config get prefix)/bin"
REPORT_FILE="daily_report.txt"
TIMEOUT_LIMIT="30m" # 각 단계별 최대 30분 제한

# GitHub Actions에서는 AI 분석 비활성화
export RUN_AI_ANALYSIS="false"

# 2. 분석 타겟 날짜 확보
ANALYSIS_DATES=$(node scripts/get-analysis-dates.js)
D1=$(echo $ANALYSIS_DATES | cut -d',' -f1)
D2=$(echo $ANALYSIS_DATES | cut -d',' -f2)

echo "🎯 분석 타겟: $D1, $D2"
printf '{"d1": "%s", "d2": "%s"}' "$D1" "$D2" > dates.json # 수정된 부분

# 3. 데이터 수집 (Playwright 타임아웃 방지)
echo "🌐 데이터 수집 시작..."
timeout $TIMEOUT_LIMIT npm run scrape || echo "⚠️ 수집 단계에서 타임아웃 발생 (일부 데이터만 처리)"

# 4. 간소화된 분석 실행 (Gemini 분석 대신)
echo "🤖 정보 추출/분석 가동 (AI 분석 ${RUN_AI_ANALYSIS})..."
timeout $TIMEOUT_LIMIT npx ts-node backend/src/orchestrator.js || echo "⚠️ 정보 추출/분석 단계에서 타임아웃 발생"

# 5. 카카오톡 전송
if [ -f "kakao_manager.js" ] && [ -f "$REPORT_FILE" ]; then
    echo "📲 카카오톡 리포트 전송 중..."
    REPORT_CONTENT=$(cat "$REPORT_FILE")
    # YYYY, MM, DD를 동적으로 추출하여 링크 생성
    YEAR=$(date +%Y); MONTH=$(date +%m); DAY=$(date +%d)
    RESULT_FOLDER_LINK="https://github.com/HYEONGCHANCHO/SUBSCRIPTION-ANALYSIS/tree/main/backend/data/downloads/CheongyakHome/$YEAR/$MONTH/$DAY/"
    node kakao_manager.js send "$REPORT_CONTENT" "$RESULT_FOLDER_LINK"
fi

echo "✅ 모든 작업 완료"