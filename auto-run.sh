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

echo "📢 *청약 통합 정밀 분석 리포트 (4월 27일 스타일)*" > $REPORT_FILE
echo "" >> $REPORT_FILE

# 분석 도우미 노드 스크립트 생성
cat <<'EOF' > report_helper.js
const fs = require('fs');
const path = require('path');

function parseAndFormat(jsonStr, fileName, reportFile) {
    try {
        // 마크다운 블록 제거 및 JSON 추출
        const cleanJson = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim();
        const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return false;
        
        const data = JSON.parse(jsonMatch[0]);
        const matchIcon = data.isMatch ? "✅" : "❌";
        
        let detail = `🏠 *${fileName.replace('.pdf', '')}* ${matchIcon}\n`;
        
        if (data.matchedTypes && data.matchedTypes.length > 0) {
            const type = data.matchedTypes[0];
            detail += `   └ 면적: ${type.area} | 가격: ${type.price}\n`;
        }
        
        // 4월 27일 스타일의 상세 요약 보장
        const summary = data.summary || "상세 분석 내용 없음";
        detail += `- ${summary}\n\n`;
        
        fs.appendFileSync(reportFile, detail);
        return true;
    } catch (e) {
        console.error('Parsing error:', e);
        return false;
    }
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
    TEXT=$(node extract_text.js "$file" | head -c 12000)
    
    # 4월 27일 스타일을 강제하는 강화된 프롬프트
    PROMPT="당신은 전문 부동산 에이전트입니다. 아래 공고문을 분석하여 JSON으로 출력하세요.
    [중요] 'summary' 필드에는 반드시 다음 내용을 포함하여 3~5줄로 작성하세요:
    - [입지/교통]: 주변 전철역, 주요 도로망, 직주근접성
    - [가격 경쟁력]: 주변 시세 대비 저렴한지, 안전마진 여부
    - [평면/특징]: 단지 규모, 특화 설계, 커뮤니티 등

    [분석 기준]
    $CONFIG_CONTENT
    
    [텍스트]
    $TEXT"
    
    # 분석 실행 및 임시 저장
    gemini -p "$PROMPT" -y --raw-output > temp_result.json
    
    # Node helper를 통한 정교한 파싱 및 리포트 기록
    if node report_helper.js temp_result.json "$FILENAME" "$REPORT_FILE"; then
        echo "   └ 분석 및 리포트 기록 완료"
        # 결과 JSON 파일로도 저장
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
