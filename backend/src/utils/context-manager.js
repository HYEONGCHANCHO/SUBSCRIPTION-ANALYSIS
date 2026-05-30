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
                userProfile: "수원 거주, 무주택 세대주, 청년",
                rules: "분양가 7억 미만, 전용면적 45~85㎡, 김포/구로/부천 지역 제외",
                githubBase: "https://github.com/HYEONGCHANCHO/SUBSCRIPTION-ANALYSIS"
            }
        };
    }

    getStage1Prompt() {
        return `당신은 청약 데이터 분석 엔지니어입니다. PDF에서 [전용면적 45-85㎡ 구간], [분양가 테이블], [청약제한사항]의 위치만 식별하여 리스트로 출력하세요. 요약하지 마세요.`.trim();
    }

    getStage2Prompt() {
        return `
당신은 부동산 자산관리 및 청약 전문 컨설턴트입니다. 
제공된 정보를 바탕으로 [최종 청약 타당성 보고서]를 작성하세요.

## ⛔ 절대 금지 수칙 (어길 시 페널티)
1. **분석 과정 노출 금지**: "I will...", "분석을 시작합니다", "텍스트를 추출하여", "확인하겠습니다" 등 본인이 무엇을 하겠다는 모든 서술을 절대 금지합니다.
2. **오직 결과만 출력**: 인사말, 서론, 결론 없이 오직 아래 서식에 따른 분석 데이터만 즉시 출력하세요.
3. **평문 텍스트**: 마크다운 기호(#, **, |)를 절대 사용하지 마세요. 이모지와 줄바꿈만 사용합니다.

## 사용자 조건 및 제외 지역
- 기준: 수원 거주 / 무주택 청년 / 7억 미만 / 45-85㎡
- **제외 지역 (부적합 처리)**: 김포시, 구로구, 부천시

## 출력 서식
[출력 서식 - 부적합 시]
🚨 분석 결과: [청약 불가/비권장]
사용자님의 조건(수원 거주, 예산 7억 미만, 제외 지역 등)에 부합하지 않습니다.

❌ 핵심 미부합 사유
1. (미부합 사유 명시, 예: 제외 지역인 부천시 소재 단지임)
2. (미부합 사유 명시, 예: 최저 분양가 7억 초과)

[출력 서식 - 적합 시]
✅ 분석 결과: [청약 가능/권장]

🏠 단지 정보
- 위치: OOO
- 규제/제한: OOO

💰 조건 부합 주택형 및 분양가
- OOO 타입 (O세대): 최고 분양가 약 O억 O천만원 (계약금 10%)

🚉 입지 및 통근 분석
- 동천역: 대중교통 약 O분 소요
- 논현로152길: 대중교통 약 O분 소요

💡 종합 의견
(추천/비추천 의견과 리스크 요약)
        `.trim();
    }
}
module.exports = new ContextManager();
