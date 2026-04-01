#!/bin/bash

# 1. 환경 설정 및 경로 이동
cd /Users/hyeongchan/subscription-analysis
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

# 2. 분석 중 잠자기 방지 (caffeinate)
caffeinate -i -s -w $$ &
CAFF_PID=$!

# 3. 로그 기록 시작
echo "==========================================" >> auto-analysis.log
echo "📅 KST 10:00 자동 분석 시작: $(date)" >> auto-analysis.log

# 4. 과거 데이터 정리 및 스크래핑/분석 실행
/usr/local/bin/npm run scrape:home >> auto-analysis.log 2>&1
/usr/local/bin/npx ts-node optimize-analysis.ts >> auto-analysis.log 2>&1

# 5. 잠자기 방지 프로세스 종료 및 완료 보고
kill $CAFF_PID
echo "✅ 자동 분석 완료: $(date)" >> auto-analysis.log
echo "==========================================" >> auto-analysis.log
