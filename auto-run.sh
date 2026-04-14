#!/bin/bash

# 1. 환경 설정
export PATH="$PATH:$(npm config get prefix)/bin"

# 2. 날짜 조회 (주중 3영업일)
ANALYSIS_DATES=$(node scripts/get-analysis-dates.js)
D1=$(echo $ANALYSIS_DATES | cut -d',' -f1)
D2=$(echo $ANALYSIS_DATES | cut -d',' -f2)
D3=$(echo $ANALYSIS_DATES | cut -d',' -f3)

echo "🎯 분석 대상: $D1, $D2, $D3"

# 3. 데이터 수집 (청약홈 + LH)
# 최적화된 스크래퍼 실행 (타겟 날짜만 수집)
npm run scrape

# 4. 리포트 생성 (중복 체크 및 AI 분석 통합)
echo "{\"d1\": \"$D1\", \"d2\": \"$D2\", \"d3\": \"$D3\"}" > dates.json

cat <<'INNER_EOF' > process_analysis.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const { d1, d2, d3 } = JSON.parse(fs.readFileSync('dates.json', 'utf8'));
const dates = [d1, d2, d3];
const logPath = 'backend/data/logs/analysis.log';
if (!fs.existsSync('backend/data/logs')) fs.mkdirSync('backend/data/logs', { recursive: true });

function log(msg) {
    const timestamp = new Date().toISOString();
    const line = "[" + timestamp + "] " + msg + "\n";
    fs.appendFileSync(logPath, line);
    console.log(msg);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
    log("🚀 분석 프로세스 시작 (3영업일 대상, Rate Limit 방지 10초 대기 적용)");
    let finalReport = "📢 *청약 정밀 분석 통합 리포트 (KST 3영업일)*\n";

    for (const date of dates) {
        log("📅 날짜 처리 중: " + date);
        finalReport += "\n📅 *" + date + "*\n----------------------------------\n";
        const formattedDate = date.replace(/-/g, '/');
        const sites = ['CheongyakHome', 'LH'];
        
        for (const site of sites) {
            const downloadDir = path.join('backend/data/downloads', site, formattedDate);
            const resultDir = path.join('backend/data/results', site, formattedDate);

            if (!fs.existsSync(downloadDir)) {
                log("   - [" + site + "] 다운로드 폴더 없음: " + downloadDir);
                continue;
            }
            if (!fs.existsSync(resultDir)) fs.mkdirSync(resultDir, { recursive: true });

            const files = fs.readdirSync(downloadDir).filter(f => f.endsWith('.pdf') || f.endsWith('.hwpx') || f.endsWith('.hwp'));
            
            if (files.length === 0) {
                log("   - [" + site + "] 해당 일자 공고 파일 없음");
                finalReport += "📍 (" + site + ") 해당 일자 공고 없음\n";
                continue;
            }

            for (const file of files) {
                const fileName = path.parse(file).name;
                const resPath = path.join(resultDir, fileName + '.json');
                const failPath = path.join(resultDir, '[조건 미부합] ' + fileName + '.json');
                
                let summary = "";
                let matchIcon = "";

                if (fs.existsSync(resPath)) {
                    try {
                        const data = JSON.parse(fs.readFileSync(resPath, 'utf8'));
                        matchIcon = "[✅ 조건 부합]";
                        summary = data.summary || "요약 정보 없음";
                        log("   ✅ 기존 결과 활용 (성공): " + fileName);
                    } catch(e) { matchIcon = "[⚠️ 데이터 오류]"; log("   ❌ JSON 파싱 에러: " + fileName); }
                } else if (fs.existsSync(failPath)) {
                    try {
                        const data = JSON.parse(fs.readFileSync(failPath, 'utf8'));
                        matchIcon = "[❌ 조건 미달]";
                        summary = data.summary || "요약 정보 없음";
                        log("   ❌ 기존 결과 활용 (탈락): " + fileName);
                    } catch(e) { matchIcon = "[⚠️ 데이터 오류]"; log("   ❌ JSON 파싱 에러: " + fileName); }
                } else {
                    log("   🔍 신규 분석 시작: " + fileName + " (" + site + ")");
                    try {
                        // Rate Limit 방지를 위해 각 분석 전 10초 대기
                        log("      - 10초 대기 중... (Rate Limit 방지)");
                        await sleep(10000);

                        const filePath = path.join(downloadDir, file);
                        const prompt = "파일 '" + filePath + "'의 내용을 'analysis-config.md' 기준으로 정밀 분석해서 결과를 JSON으로 출력해줘. 결과는 반드시 matchedTypes, eligibility, summary 등을 포함해야 해. 다른 부연 설명 없이 JSON만 출력해.";
                        
                        const safePrompt = prompt.replace(/"/g, '\\"');
                        const cmd = "gemini \"" + safePrompt + "\"";
                        
                        log("      - 명령어 실행: " + cmd.substring(0, 100) + "...");
                        const output = execSync(cmd, { 
                            encoding: 'utf8', 
                            timeout: 120000 
                        });
                        
                        let cleanOutput = output.replace(/```json|```/g, '').trim();
                        const jsonMatch = cleanOutput.match(/\{[\s\S]*\}/);
                        
                        if (jsonMatch) {
                            const result = JSON.parse(jsonMatch[0]);
                            const isMatch = result.isMatch === true || result.eligibility === 'eligible' || result.eligibility === 'PASSED';
                            matchIcon = isMatch ? "[✅ 조건 부합]" : "[❌ 조건 미달]";
                            summary = result.summary || "요약 생성 실패";
                            const savePath = isMatch ? resPath : failPath;
                            fs.writeFileSync(savePath, JSON.stringify(result, null, 2));
                            log("      - 분석 성공: " + matchIcon);
                        } else {
                            throw new Error("Gemini 응답에서 JSON을 찾을 수 없음:\n" + output.substring(0, 200));
                        }
                    } catch (e) {
                        log("      ❌ 분석 실패 (" + fileName + "): " + e.message);
                        if (e.stdout) log("      - STDOUT: " + e.stdout);
                        if (e.stderr) log("      - STDERR: " + e.stderr);
                        matchIcon = "[⚠️ 분석 실패/대기]";
                        summary = "분석 중 오류 발생 또는 타임아웃 (수동 확인 필요)";
                    }
                }
                finalReport += "📍 *" + fileName + "* " + matchIcon + "\n- " + summary + "\n";
            }
        }
    }

    log("✅ 분석 프로세스 완료");
    fs.writeFileSync('daily_report.txt', finalReport);
}

run().catch(e => {
    log("🔥 전역 오류 발생: " + e.message);
    process.exit(1);
});
INNER_EOF

node process_analysis.js
rm process_analysis.js dates.json

# 5. 슬랙 전송
# .env 파일에서 SLACK_WEBHOOK_URL을 읽어오기 (직접 대입 대신)
SLACK_URL=$(grep "^SLACK_WEBHOOK_URL=" .env | cut -d '=' -f2)
if [ -z "$SLACK_URL" ]; then
    # 환경변수에서 직접 시도 (GitHub Action 환경)
    SLACK_URL=$SLACK_WEBHOOK_URL
fi

if [ -n "$SLACK_URL" ]; then
    node -e "
    const https = require('https');
    const fs = require('fs');
    const content = fs.readFileSync('daily_report.txt', 'utf8');
    const payload = JSON.stringify({ text: content });
    const url = new URL('$SLACK_URL');
    const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    };
    const req = https.request(options, (res) => {
        console.log('Slack response:', res.statusCode);
    });
    req.on('error', (e) => console.error('Slack error:', e));
    req.write(payload);
    req.end();
    "
fi
