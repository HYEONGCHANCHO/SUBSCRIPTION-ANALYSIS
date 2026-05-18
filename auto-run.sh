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

# 4. 에이전트 정밀 분석 루프
echo "🤖 에이전트 정밀 분석 시작..."
REPORT_FILE="daily_report.txt"
CONFIG_CONTENT=$(cat analysis-config.md)

echo "📢 *청약 통합 정밀 분석 리포트 (에이전트 모드)*" > $REPORT_FILE
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
            detail += `   └ 면적: ${data.matchedTypes[0].area} | 가격: ${data.matchedTypes[0].price}\n`;
        }
        detail += `- ${data.summary || "상세 내용 없음"}\n\n`;
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
    TEXT=$(node extract_text.js "$file" | head -c 15000)
    
    PROMPT="당신은 전문 부동산 에이전트입니다. 아래 공고문을 분석하여 JSON으로 출력하세요. [중요] 'summary'에는 [입지/교통], [가격 경쟁력], [평면/특징]을 포함하여 3~5줄로 작성하고 구체적인 가격을 언급하세요. [분석 기준] $CONFIG_CONTENT [텍스트] $TEXT"
    
    gemini -p "$PROMPT" -y --raw-output > temp_result.json
    
    if node report_helper.js temp_result.json "$FILENAME" "$REPORT_FILE"; then
        mv temp_result.json "$RESULT_DIR/${FILENAME%.*}.json"
    fi
done

rm -f report_helper.js temp_result.json

# 5. 카카오톡 전송 (슬랙 대체)
if [ -f "kakao_manager.js" ] && [ -f "$REPORT_FILE" ]; then
    echo "📲 카카오톡 리포트 전송 중..."
    REPORT_CONTENT=$(cat "$REPORT_FILE")
    node kakao_manager.js send "$REPORT_CONTENT"
fi
