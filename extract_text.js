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
                // 핵심 키워드 문장과 문맥을 위한 전후 1문장씩 포함
                if (i > 0) essentialLines.push(lines[i-1].trim());
                essentialLines.push(line);
                if (i < lines.length - 1) essentialLines.push(lines[i+1].trim());
            }
        }

        // 중복 제거 후 1500자로 제한하여 토큰 최소화
        return [...new Set(essentialLines)].join('\n').substring(0, 1500);
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
