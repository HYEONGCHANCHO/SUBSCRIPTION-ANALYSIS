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

# 4. 에이전트 정밀 분석 루프 (임대주택 보증금 및 가격 컷트라인 강화)
echo "🤖 에이전트 정밀 분석 시작..."
REPORT_FILE="daily_report.txt"
CONFIG_CONTENT=$(cat analysis-config.md)

echo "📢 *청약 통합 정밀 분석 리포트 (4월 27일 스타일)*" > $REPORT_FILE
echo "" >> $REPORT_FILE

cat <<'EOF' > report_helper.js
const fs = require('fs');
function parseAndFormat(jsonStr, fileName, reportFile) {
    try {
        const cleanJson = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim();
        const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return false;
        
        const data = JSON.parse(jsonMatch[0]);
        const matchIcon = data.isMatch ? "✅" : "❌";
        
        let detail = `🏠 *${fileName.replace('.pdf', '')}* ${matchIcon}\n`;
        
        if (data.matchedTypes && data.matchedTypes.length > 0) {
            const type = data.matchedTypes[0];
            detail += `   └ 면적: ${type.area} | 가격(보증금): ${type.price}\n`;
        } else {
            detail += `   └ 면적/가격 정보 파악 불가\n`;
        }
        
        const summary = data.summary || "상세 분석 내용 없음";
        detail += `- ${summary}\n\n`;
        
        fs.appendFileSync(reportFile, detail);
        return true;
    } catch (e) { return false; }
}
const args = process.argv.slice(2);
parseAndFormat(fs.readFileSync(args[0], 'utf8'), args[1], args[2]);
EOF

find backend/data/downloads -name "*.pdf" | while read -r file; do
    FILENAME=$(basename "$file")
    DIRNAME=$(dirname "$file")
    RESULT_DIR="${DIRNAME/downloads/results}"
    mkdir -p "$RESULT_DIR"
    
    echo "   🔍 분석 중: $FILENAME"
    # 가격 정보(보증금, 공급금액)를 찾기 위해 더 넓은 범위를 추출 (15000자)
    TEXT=$(node extract_text.js "$file" | head -c 15000)
    
    # 임대 보증금 및 7억 컷트라인을 강조한 프롬프트
    PROMPT="당신은 전문 부동산 에이전트입니다. 아래 공고문을 분석하여 JSON으로 출력하세요.
    [필수 준수 사항]
    1. 분양가는 반드시 7억 미만이어야 isMatch: true입니다.
    2. 임대주택의 경우 '임대보증금'을 가격으로 간주하여 7억 미만인지 판단하세요.
    3. 가격(보증금) 정보를 텍스트에서 찾을 수 없는 경우 절대 isMatch: true를 주지 마세요.
    4. 'summary'에는 [입지/교통], [가격 경쟁력], [평면/특징]을 포함하여 3~5줄로 작성하세요. 가격 경쟁력 부분에 구체적인 금액(또는 보증금)을 언급하세요.

    [분석 기준]
    $CONFIG_CONTENT
    
    [텍스트]
    $TEXT"
    
    gemini -p "$PROMPT" -y --raw-output > temp_result.json
    
    if node report_helper.js temp_result.json "$FILENAME" "$REPORT_FILE"; then
        echo "   └ 분석 및 리포트 기록 완료"
        mv temp_result.json "$RESULT_DIR/${FILENAME%.*}.json"
    else
        echo "   ⚠️ 분석 실패: $FILENAME"
    fi
done

rm -f report_helper.js temp_result.json

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
