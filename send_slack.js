const https = require('https');
const fs = require('fs');
const path = require('path');

// .env에서 URL 로드
const env = fs.readFileSync('.env', 'utf8');
const match = env.match(/SLACK_WEBHOOK_URL=(.*)/);
const url = match ? match[1].trim() : null;

if (!url) {
    console.error('SLACK_WEBHOOK_URL not found');
    process.exit(1);
}

const payload = {
    text: "📢 *오늘의 청약 분석 리포트 (KST 2026-04-01)*\n\n" +
          "오늘 수집된 공고 분석 결과입니다.\n\n" +
          "✨ *신규 발견 공고*:\n- *오늘 신규로 올라온 공고는 없습니다.*\n\n" +
          "✅ *오늘(04/01) 접수 가능한 주요 공고*:\n" +
          "1. *힐스테이트 용인마크밸리(7차)*: 7.1억대 대형 평수, 수원 인접 입지.\n" +
          "2. *청계 노르웨이숲(7차)*: 7.2억대 동대문구 무순위 청약.\n" +
          "3. *안양자이 헤리티온(2차)*: 안양 대단지, 가성비 위주 분석 완료.\n\n" +
          "상세 정보는 프로젝트 결과 폴더를 확인해 주세요."
};

const req = https.request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
}, (res) => {
    console.log(`Slack Response: ${res.statusCode}`);
});

req.write(JSON.stringify(payload));
req.end();
