const fs = require('fs');
const pdf = require('pdf-parse');

/**
 * extract_text.js에서 성공했던 로직을 그대로 사용
 */
async function extractText(filePath) {
    const dataBuffer = fs.readFileSync(filePath);
    try {
        // extract_text.js와 동일한 호출 방식
        const data = await pdf(dataBuffer);
        return data.text;
    } catch (e) {
        // 만약 실패한다면 .default 시도 (방어 로직)
        try {
            const data = await pdf.default(dataBuffer);
            return data.text;
        } catch (e2) {
            throw new Error(`PDF extraction failed completely: ${e.message}`);
        }
    }
}

module.exports = { extractText };