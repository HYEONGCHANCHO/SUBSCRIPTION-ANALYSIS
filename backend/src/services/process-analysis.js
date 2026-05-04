const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

async function main() {
    const datesData = JSON.parse(fs.readFileSync('dates.json', 'utf8'));
    const dates = [datesData.d1, datesData.d2].filter(Boolean);

    function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }

    // 약식 분석 (Heuristic) - AI 실패 시 대비하여 미리 추출
    function getBasicInfo(text) {
        if (!text) return { area: "미파악", price: "미파악", loc: "위치 미파악" };
        const area = text.match(/(\d{2,3}(?:\.\d+)?)\s*(?:㎡|제곱미터)/)?.[1] || "미파악";
        const priceMatch = text.match(/([\d,]+)\s*(?:만원|억원)/);
        let price = "미파악";
        if (priceMatch) {
            const val = priceMatch[1].replace(/,/g, '');
            price = text.includes('억원') ? `${val}억` : `${(parseInt(val)/10000).toFixed(1)}억`;
        }
        const loc = text.match(/(?:위치|소재지).*?([가-힣]+\s*[가-힣]+(?:시|군|구))/)?.[1] || "위치 미파악";
        return { area, price, loc };
    }

    let finalReport = "📢 *청약 통합 Pro 정밀 분석 리포트*\n";

    for (const date of dates) {
        finalReport += `\n📅 *${date}*\n----------------------------------\n`;
        const formattedDate = date.replace(/-/g, '/');
        const downloadDir = path.join('backend/data/downloads/CheongyakHome', formattedDate);
        
        if (!fs.existsSync(downloadDir)) continue;
        const files = fs.readdirSync(downloadDir).filter(f => f.endsWith('.pdf'));

        for (const file of files) {
            const fileName = path.parse(file).name;
            if (['김포', '평택', '파주', '양주', '동두천', '구리'].some(r => fileName.includes(r))) continue;

            log(`[Pro Analyze] ${fileName} 분석 중...`);
            let extractedText = "";
            try {
                // 토큰 절약을 위해 최적화된 1000자만 추출
                extractedText = execSync(`node extract_text.js "${path.join(downloadDir, file)}"`, { encoding: 'utf8' });
            } catch (e) {}

            const basic = getBasicInfo(extractedText);
            let aiContent = "";
            let status = "⚪";

            try {
                // 사용자 의도 반영: gemini-1.5-pro 모델 사용 (Pro 토큰 활용)
                const prompt = `청약 전문가로서 아래 공고를 정밀 분석해. 반드시 JSON으로만 답해. 
{ "isMatch": bool, "summary": { "location": "입지/인프라", "transport": "강남/동천역 소요시간", "market": "시세/안전마진", "eligibility": "자격(수원 무주택 청년 등)", "features": "특징" } }
[텍스트] ${extractedText}`;

                const safePrompt = prompt.replace(/"/g, '\\"').replace(/`/g, '\\`');
                // CLI 환경 그대로 실행
                const output = execSync(`gemini -m gemini-1.5-pro "${safePrompt}"`, { encoding: 'utf8', timeout: 90000 });
                const ai = JSON.parse(output.replace(/```json|```/g, "").trim());
                
                status = ai.isMatch ? "🟢" : "🔴";
                const s = ai.summary;
                aiContent = `\n🤖 *Pro 분석:*
   - 📍 입지: ${s.location}
   - 🚗 교통: ${s.transport}
   - 💰 시세: ${s.market}
   - ✅ 자격: ${s.eligibility}
   - ✨ 특징: ${s.features}`;
            } catch (e) {
                aiContent = `\n🤖 *Pro 분석:* (AI 연동 지연으로 약식 데이터만 우선 제공합니다.)`;
            }

            // PDF 직접 다운로드 링크 개선
            const baseUrl = "https://github.com/HYEONGCHANCHO/SUBSCRIPTION-ANALYSIS/blob/main/";
            const encodedPath = path.join(downloadDir, file).split(path.sep).map(p => encodeURIComponent(p)).join('/');
            const pdfLink = `${baseUrl}${encodedPath}?raw=true`;

            finalReport += `\n🏠 *${fileName}* ${status}
📍 위치: ${basic.loc} | 🔢 약식: ${basic.area}㎡ / ${basic.price}${aiContent}
👉 <${pdfLink}|📄 *공고문 원본 보기*>\n`;
        }
    }

    fs.writeFileSync('daily_report.txt', finalReport);
    console.log(finalReport);
}

main();
