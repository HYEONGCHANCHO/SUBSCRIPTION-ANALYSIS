const fs = require('fs');
const pdf = require('pdf-parse');

async function extractEssentialText(filePath) {
    try {
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdf(dataBuffer);
        const fullText = data.text;

        const keywords = [
            '공급금액', '분양가', '전용면적', '공급규모', '신청자격', '입주자 선정', 
            '당첨자 발표', '청약일정', '위치', '소재지', '거주의무', '재당첨'
        ];

        const lines = fullText.split('\n');
        const essentialLines = [];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.length < 5) continue;

            if (keywords.some(k => line.includes(k))) {
                if (i > 0) essentialLines.push(lines[i-1].trim());
                essentialLines.push(line);
                if (i < lines.length - 1) essentialLines.push(lines[i+1].trim());
            }
        }

        // 약식 분석과 AI 분석의 정확도를 위해 2000자로 상향
        return [...new Set(essentialLines)].join('\n').substring(0, 2000);
    } catch (e) {
        return null;
    }
}

const filePath = process.argv[2];
if (filePath) {
    extractEssentialText(filePath).then(text => {
        if (text) process.stdout.write(text);
        else process.exit(1);
    });
}
