const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { execSync } = require('child_process');

async function main() {
    // 1. 설정 및 API 키 (사용자 환경 변수 로드)
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("❌ API 키를 찾을 수 없습니다.");
        return;
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const datesData = JSON.parse(fs.readFileSync('dates.json', 'utf8'));
    const dates = [datesData.d1, datesData.d2].filter(Boolean);

    // 2. 강화된 약식 분석 함수
    function heuristicAnalysis(text) {
        if (!text) return { area: "미파악", price: "미파악", loc: "위치 미파악" };
        
        const areaMatch = text.match(/(\d{2,3}(?:\.\d+)?)\s*(?:㎡|제곱미터)/);
        const priceMatch = text.match(/([\d,]+)\s*(?:만원|억원)/);
        const locMatch = text.match(/(?:위치|소재지).*?([가-힣]+\s*[가-힣]+(?:시|군|구))/);

        let priceStr = "미파악";
        if (priceMatch) {
            const val = priceMatch[1].replace(/,/g, '');
            priceStr = text.includes('억원') ? `${val}억` : `${(parseInt(val)/10000).toFixed(1)}억`;
        }

        return {
            area: areaMatch ? `${areaMatch[1]}㎡` : "미파악",
            price: priceStr,
            loc: locMatch ? locMatch[1] : "위치 미파악"
        };
    }

    let finalReport = "📢 *청약 통합 정밀 분석 리포트*\n";

    for (const date of dates) {
        finalReport += `\n📅 *${date}*\n----------------------------------\n`;
        const formattedDate = date.replace(/-/g, '/');
        const downloadDir = path.join('backend/data/downloads/CheongyakHome', formattedDate);
        
        if (!fs.existsSync(downloadDir)) continue;
        const files = fs.readdirSync(downloadDir).filter(f => f.endsWith('.pdf'));

        for (const file of files) {
            const fileName = path.parse(file).name;
            // 제외 지역 필터링
            if (['김포', '평택', '파주', '양주', '동두천', '구리'].some(r => fileName.includes(r))) continue;

            console.log(`[Analyze] ${fileName} 처리 중...`);
            let extractedText = "";
            try {
                extractedText = execSync(`node extract_text.js "${path.join(downloadDir, file)}"`, { encoding: 'utf8' });
            } catch (e) {}

            const basic = heuristicAnalysis(extractedText);
            let aiReport = "";
            let status = "⚪";

            try {
                // AI 정밀 분석 시도
                const prompt = `청약 전문가로서 분석. 반드시 JSON 응답.
{ "isMatch": bool, "summary": { "location": "입지", "transport": "교통", "market": "시세/안전마진", "eligibility": "자격", "features": "특징" } }
[텍스트] ${extractedText}`;

                const result = await model.generateContent(prompt);
                const ai = JSON.parse(result.response.text().replace(/```json|```/g, "").trim());
                status = ai.isMatch ? "🟢" : "🔴";
                const s = ai.summary;
                aiReport = `\n🤖 *AI 분석:* 📍입지(${s.location}) 🚗교통(${s.transport}) 💰시세(${s.market}) ✅자격(${s.eligibility})`;
            } catch (e) {
                aiReport = `\n🤖 *AI 분석:* (AI 일시적 지연으로 약식 데이터만 제공)`;
            }

            // PDF 링크 개선 (?raw=true 추가)
            const baseUrl = "https://github.com/HYEONGCHANCHO/SUBSCRIPTION-ANALYSIS/blob/main/";
            const encodedPath = path.join(downloadDir, file).split(path.sep).map(p => encodeURIComponent(p)).join('/');
            const pdfLink = `${baseUrl}${encodedPath}?raw=true`;

            finalReport += `\n🏠 *${fileName}* ${status}\n📍 위치: ${basic.loc} | 🔢 약식: ${basic.area} / ${basic.price}${aiReport}\n👉 <${pdfLink}|📄 *공고문 원본 보기*>\n`;
        }
    }

    fs.writeFileSync('daily_report.txt', finalReport);
    console.log(finalReport);
}

main();
