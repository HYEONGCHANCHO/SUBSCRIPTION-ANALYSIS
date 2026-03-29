# 청약 공고 자동 분석 서비스 설계 (Subscription Analysis Service Design)

본 문서는 `.gemini/agents/` 및 `.gemini/skills/`의 지침을 기반으로 작성된 프로젝트 상세 설계서입니다. 모든 구현 단계에서 이 문서와 해당 가이드라인을 엄격히 준수합니다.

## 1. 프로젝트 목표 (Project Goals)
- 로컬 환경에서 주요 청약 사이트 3곳(청약홈, LH, SH)의 공고를 자동 수집.
- 공고문(PDF/HWP/Image)을 다운로드하고 AI/OCR 기술로 핵심 정보를 분석.
- 분석된 데이터를 사용자 친화적인 대시보드로 시각화하여 한눈에 파악.

## 2. 기술 스택 (Tech Stack)

### 2.1 Backend (Backend Specialist 지침 준수)
- **Runtime:** Node.js (TypeScript)
- **Scraper:** Playwright (동적 웹 페이지 대응)
- **Database:** SQLite (로컬 데이터 영속성 관리)
- **File Analysis:** `pdf-parse`, `Tesseract.js` (OCR), LangChain + OpenAI (요약 및 정보 추출)
- **API Framework:** Express (RESTful API 설계)

### 2.2 Frontend (Frontend Specialist 지침 준수)
- **Library:** React (TypeScript)
- **Styling:** Tailwind CSS (UI/UX Excellence 준수)
- **State Management:** React Context API or Zustand
- **Visualization:** Recharts (청약 경쟁률 등 시각화)

## 3. 상세 아키텍처 (Architecture Details)

### 3.1 Scraper Layer (Clean Code 적용)
- `AbstractScraper` 클래스를 상속받는 `HomeScraper`, `LHScraper`, `SHScraper` 구현.
- 사이트별 수집 로직을 캡슐화하고 공통 인터페이스(ICollector)를 제공.

### 3.2 Analysis Pipeline
1. **Download:** 공고 파일을 `temp/` 폴더에 다운로드.
2. **Extract:** 텍스트 및 이미지 데이터 추출.
3. **Parse:** AI 모델을 통해 '모집 공고일, 공급 가격, 거주 요건, 소득 기준' 등 핵심 정보 정형화.
4. **Save:** 정형화된 데이터를 SQLite DB에 저장.

### 3.3 Dashboard UI/UX
- **List View:** 필터링 및 검색 기능이 포함된 공고 목록.
- **Detail View:** AI 분석 결과 요약과 원문 파일 링크 제공.
- **Status Dashboard:** 지역별/유형별 공고 분포 시각화.

## 4. 상세 구현 계획 (Detailed Implementation Plan)

### 4.1 청약홈 수집 및 다운로드 프로세스 (Phase 2-1)
1. **환경 접속 및 필터링:** 
   - `applyhome.co.kr` 캘린더 접속 및 서울/경기 필터링 수행.
   - **ID 기반 정밀 조작:** `#ji_se`, `#ji_kyengk` 등 고유 ID를 사용하여 직접 조작하고, `cal_active` 클래스 유무를 통해 실제 활성화 상태를 보장함.
   - **간소화된 흐름:** 필터링 조작이 성공적으로 수행되면 별도의 텍스트 검증 없이 즉시 공고 수집 단계로 진입함.
2. **날짜 필터링 및 범위 설정:**
   - 실행 시점의 '오늘' 이후 공고만 수집 대상으로 확정.
3. **다중 월(Month) 및 연도 순회 로직:**
   - 현재 달의 작업이 끝나면 다음 월/연도로 이동.
   - 이동 후에는 반드시 **1단계의 필터링 및 검증 과정을 재수행**하여 일관성을 보장함. 
4. **공고 탐색 및 순회:** 
   - 필터링된 안전한 리스트에서 공고 식별.
5. **다운로드 및 중복 체크:**
   - 각 공고 클릭 -> 상세 팝업 오픈.
   - **다중 다운로드 대응:** '모집공고문 보기' 클릭 시 '다운로드 이벤트' 또는 '새 창(PDF 뷰어) 오픈' 상황을 모두 감지하여 파일로 저장함.
   - **팝업 강제 초기화:** 공고 처리 전후로 화면에 남아있는 모든 다이얼로그(`.ui-dialog`)를 강제로 닫거나 제거하여 다음 공고 클릭 시 간섭을 원천 차단함.
   - **중복 방지:** 파일명 비교를 통해 불필요한 다운로드 생략.


### 4.2 데이터 분석 및 정형화 프로세스 (Phase 3)
1. **텍스트 추출:** `pdf-parse` 라이브러리를 사용하여 저장된 PDF 내 원문 텍스트 추출.
2. **AI 정보 분석:**
   - OpenAI GPT-4o 또는 유사 모델 연동.
   - 프롬프트: "공고문에서 모집공고일, 분양가, 거주요건(서울/경기), 소득기준, 전매제한 기간을 추출해줘."
3. **DB 업데이트:** 분석된 요약본을 `notices` 테이블의 `analyzed_summary` 필드에 저장.

### 4.3 결과 시각화 (Phase 4)
- React 기반 대시보드 구축.
- 지역별/금액별 필터링 기능 및 AI 요약 정보 카드 UI 제공.

## 5. 검증 및 품질 관리 (Quality Control)
- 모든 코드는 `Clean Code & Refactoring Skill` 지침에 따라 가독성 있게 작성.
- 에러 처리 시 `Backend Specialist`의 표준 에러 핸들링 준수.
- 테스트 코드는 핵심 비즈니스 로직(크롤링, 파싱)에 대해 작성.
