const fs = require('fs');
const path = require('path');

class ContextManager {
    constructor() {
        this.cacheDir = path.resolve(process.cwd(), 'intelligence');
        this.contextPath = path.join(this.cacheDir, 'context-cache.json');
        if (!fs.existsSync(this.cacheDir)) fs.mkdirSync(this.cacheDir, { recursive: true });
        this.data = this.load();
    }

    load() {
        if (fs.existsSync(this.contextPath)) {
            return JSON.parse(fs.readFileSync(this.contextPath, 'utf8'));
        }
        return {
            fixedInfo: {
                userProfile: "수원 거주, 무주택, 청년",
                rules: "분양가 7억 미만, 전용면적 45~85㎡, 임대보증금 포함",
                githubBase: "https://github.com/HYEONGCHANCHO/SUBSCRIPTION-ANALYSIS"
            },
            feedbackContext: [
                "임대주택은 보증금을 7억 기준으로 엄격히 체크할 것",
                "조건 미달 시 사유만 1줄로 요약할 것",
                "카카오톡 전송 시 링크를 하이퍼링크 형태로 제공할 것"
            ]
        };
    }

    getSystemPrompt() {
        return `
당신은 부동산 전문 AI 에이전트입니다. 다음의 고정 정보와 사용자 피드백을 반드시 준수하여 JSON으로 분석 결과를 출력하세요.

[고정 정보] 
- 사용자 프로필: ${this.data.fixedInfo.userProfile}
- 분석 규칙: ${this.data.fixedInfo.rules} (임대주택의 경우 보증금을 분양가 기준으로 판단)

[수행 과제]
1. PDF 텍스트에서 '분양가/공급금액/보증금'과 '전용면적/공급규모'를 반드시 찾아내세요. 
2. 다양한 표 형식(무순위, 계약취소, 임대주택 등)에 대응하여 '면적'과 '가격' 정보를 정밀하게 추출하세요.
3. 사용자의 조건(7억 미만, 45~85㎡)에 부합하는지 'isMatch' (boolean) 필드에 기록하세요.
4. 분석 결과를 다음 JSON 형식으로만 응답하세요:
{
  "isMatch": boolean,
  "분석결과": "적격" | "부적격",
  "요약사유": "사용자 조건 대비 장단점을 1줄로 요약",
  "면적": "추출된 면적 정보 (예: 59㎡)",
  "가격": "추출된 가격 정보 (예: 6.5억)",
  "상세분석": { ... },
  "카카오톡_전송문구": "불필요한 URL 없이 깔끔한 요약 텍스트만 작성"
}

[중요 피드백] 
${this.data.feedbackContext.join(' / ')}
- 모든 링크는 원시 URL을 노출하지 말고, 나중에 버튼이나 텍스트 링크로 대체될 것임을 인지하세요.
        `.trim();
    }
}
module.exports = new ContextManager();
