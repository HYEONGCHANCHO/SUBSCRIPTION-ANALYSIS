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
                rules: "분양가 7억 미만, 전용면적 45~85㎡",
                githubBase: "https://github.com/HYEONGCHANCHO/SUBSCRIPTION-ANALYSIS"
            }
        };
    }

    getStage1Prompt() {
        return `
당신은 청약 및 부동산 데이터 분석 엔지니어입니다. 
제공된 입주자모집공고 PDF 텍스트에서 다음 정보가 위치한 [정확한 섹션 헤더] 또는 [문맥상 페이지 번호]를 리스트로 반환하세요.
상세 내용을 요약하거나 분석하지 말고 오직 위치 정보만 식별하세요.

[식별 대상]
1. 전용면적 45㎡ ~ 85㎡ 구간이 명시된 섹션
2. 해당 구간의 주택형별 공급금액(분양가) 및 납부 일정 테이블이 위치한 곳
3. 규제지역 여부, 재당첨 제한, 전매제한, 거주의무기간 등 청약 제한 사항 섹션

[출력 형식]
- 정보명: [위치 정보]
        `.trim();
    }

    getStage2Prompt() {
        return `
당신은 부동산 자산관리 및 청약 전문 컨설턴트입니다. 
1단계에서 식별된 핵심 정보와 사용자 조건을 결합하여 [최종 청약 타당성 보고서]를 작성하세요.

## 사용자 조건 및 분석 기준
- 사용자: ${this.data.fixedInfo.userProfile}
- 주택 조건: 45~85㎡ / 분양가 7억원 미만 (★가장 엄격한 필터 기준)
- 통근 목적지 (월요일 07:15 출발 기준 소요시간 예측):
  1) 신분당선 동천역
  2) 서울특별시 강남구 논현로152길 15

## 분석 및 출력 요구사항
1. [청약 자격 및 제한사항] 규제지역 여부, 수원 거주자(기타지역) 청약 가능 여부, 각종 제한 기간(재당첨/전매/거주).
2. [조건 부합 주택형 및 분양가] 7억 미만 타입 전수 조사. 조건 부합 시 [타입명 / 공급세대수 / 최고분양가 / 계약금 비율] 마크다운 테이블 작성. 없으면 '예산 조건 불충족' 명시.
3. [입지 및 통근 분석] 단지 기점 두 목적지까지의 예상 소요 시간 및 경로(지하철/버스) 예측.
4. [최종 종합 의견] '추천/비추천' 의견과 핵심 리스크 한 줄 요약.

주의: 본문에 없는 내용을 지어내지 말고, 확인 불가 시 "확인 불가"로 명시하십시오.
        `.trim();
    }
}
module.exports = new ContextManager();
