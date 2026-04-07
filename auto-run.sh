#!/bin/bash

# 1. 환경 설정 및 경로 이동
cd /Users/hyeongchan/subscription-analysis
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
source ~/.bash_profile 2>/dev/null
source ~/.zshrc 2>/dev/null

# 2. 분석 중 잠자기 방지 (caffeinate)
caffeinate -i -s -w $$ &
CAFF_PID=$!

# 3. 로그 기록 시작
echo "==========================================" >> auto-analysis.log
echo "📅 KST 08:00 자동 분석 시작: $(date)" >> auto-analysis.log

# 4. 과거 데이터 정리 (오늘 기준 KST 이전 데이터 삭제)
npx ts-node -e "
const fs = require('fs');
const path = require('path');
const kst = new Date(new Date().getTime() + (9 * 60 * 60 * 1000));
const todayStr = kst.getUTCFullYear() + '/' + String(kst.getUTCMonth()+1).padStart(2, '0') + '/' + String(kst.getUTCDate()).padStart(2, '0');

['CheongyakHome', 'LH'].forEach(site => {
    const baseDir = path.join('backend/data/downloads', site, '2026');
    if (fs.existsSync(baseDir)) {
        fs.readdirSync(baseDir).forEach(month => {
            const monthDir = path.join(baseDir, month);
            fs.readdirSync(monthDir).forEach(day => {
                const datePath = '2026/' + month + '/' + day;
                if (datePath < todayStr) {
                    fs.rmSync(path.join(monthDir, day), { recursive: true, force: true });
                    const resDir = path.join('backend/data/results', site, datePath);
                    if (fs.existsSync(resDir)) fs.rmSync(resDir, { recursive: true, force: true });
                }
            });
        });
    }
});
" >> auto-analysis.log 2>&1

# 5. 신규 데이터 수집 (청약홈 + LH)
/usr/local/bin/npm run scrape >> auto-analysis.log 2>&1

# 6. Gemini CLI를 이용한 전수 정밀 분석 및 슬랙 전송
# 보안을 위해 슬랙 URL은 .env에서 로드
SLACK_URL=$(grep SLACK_WEBHOOK_URL .env | cut -d '=' -f2)
/usr/local/bin/gemini "오늘(KST 기준) 포함 이후 날짜로 수집된 청약홈 및 LH의 모든 신규 공고를 'analysis-config.md' 기준(수원 거주, 7억 이하, 45-85m2 등)으로 전수 분석해줘. 특히 LH 공고는 자격 요건과 위치, 가격을 매우 상세히 보고해줘. 분석 결과 중 'isMatch'가 true인 신규 공고는 반드시 슬랙 웹훅($SLACK_URL)으로 요약 리포트를 보내줘." >> auto-analysis.log 2>&1

# 7. 잠자기 방지 프로세스 종료 및 완료 보고
kill $CAFF_PID
echo "✅ 자동 분석 및 슬랙 전송 완료: $(date)" >> auto-analysis.log
echo "==========================================" >> auto-analysis.log
