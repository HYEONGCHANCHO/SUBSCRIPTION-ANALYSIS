# Ticket: 20260409-01-fix-analysis-failure

## 1. 개요
- **목적:** GitHub Action 분석 단계에서 발생하는 `분석 실패/대기` 에러 해결 및 로깅 강화
- **배경:** 최적화 이후 수집은 빨라졌으나, 실제 AI 분석 호출 과정에서 대다수의 공고가 분석 실패로 기록됨

## 2. 현재 상태
- **문제점:** `auto-run.sh` 내 `gemini` CLI 호출 시 예외 발생
- **현상:** 슬랙 리포트에 `[⚠️ 분석 실패/대기]` 다수 발생
- **새로운 발견:** 로그 확인 결과 `MODEL_CAPACITY_EXHAUSTED` (HTTP 429 - Too Many Requests) 에러 발생 확인. 
- **가설:** 짧은 시간에 너무 많은 Gemini API 요청이 발생하여 Rate Limit에 걸림.

## 3. 계획
- [x] `auto-run.sh` 내 `process_analysis.js`의 로깅 로직 강화
- [ ] **(추가) API 호출 간 10초 대기(Sleep) 로직 추가하여 Rate Limit 방지**
- [ ] 쉘 명령어 실행 시 이스케이프 처리 강화 및 JSON 추출 로직 개선 (진행 중)
- [ ] 작업 완료 후 로컬 검증 및 GitHub Action 재배포

## 4. 수행 결과
- (작업 완료 후 업데이트 예정)
