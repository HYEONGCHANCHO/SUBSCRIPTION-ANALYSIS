const https = require('https');
const fs = require('fs');

const SLACK_URL = fs.readFileSync('.env', 'utf8').match(/SLACK_WEBHOOK_URL=(.*)/)[1].trim();

const report = `📢 *2일간의 청약 정밀 분석 리포트* (2026-04-07 ~ 2026-04-08)
--------------------------------------------------

📍 *힐스테이트 안양펠루스* [✅ 조건 부합]
- 분석: 안양 만안구 신축 브랜드 대단지. 59㎡ 저층 타입이 6.8억대로 사용자 기준(7억 미만) 충족. 
- 입지: 수원 출퇴근이 자동차로 45분 내외로 양호하며 실거주 의무 없어 메리트 높음.

📍 *당산역 더클래스 한강* [❌ 조건 미달]
- 사유: 전용면적 기준(45㎡ 이상) 미달 및 분양가 평당 단가 매우 높음. 소형 오피스텔 위주 구성으로 부적합.

📍 *의정부역 센트럴 아이파크* [❌ 조건 미달]
- 사유: 수원/강남 기준 통근 시간이 왕복 3시간 이상 소요되어 실질적 거주 불가.

📢 *안내*: 오늘 새롭게 올라온 신규 공고는 없습니다. 위 리포트는 오늘과 내일 접수 가능한 공고들의 분석 요약입니다.
--------------------------------------------------`;

const payload = { text: report };
const req = https.request(SLACK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
}, (res) => {
    console.log(`Slack Response: ${res.statusCode}`);
});

req.write(JSON.stringify(payload));
req.end();
