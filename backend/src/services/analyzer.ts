import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
const pdf = require('pdf-parse');

export interface AnalysisResult {
    site: string;
    title: string;
    path: string;
    area?: number;
    price?: number;
    dueDate?: string;
    isPassed: boolean;
    reason?: string;
    summary?: string;
}

export class Analyzer {
    async analyzeFile(filePath: string): Promise<AnalysisResult | null> {
        const dataBuffer = fs.readFileSync(filePath);
        const fileName = path.basename(filePath, '.pdf');
        const isLH = filePath.includes('/LH/');
        const site = isLH ? 'LH' : '청약홈';

        try {
            // PDF 파싱 시 최대 5페이지만 읽도록 설정
            const data = await pdf(dataBuffer, { max: 5 }); 
            const text = data.text;

            // 1. 데이터 추출 (면적, 가격, 기한)
            const area = this.extractArea(text);
            const price = this.extractPrice(text);
            const dueDate = this.extractDueDate(text);

            // 2. 필터링 조건 적용 (기존 로직 유지)
            let isPassed = true;
            let reason = '';

            // 2.1 기한 만료 체크
            if (dueDate) {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const due = new Date(dueDate.replace(/\./g, '-'));
                if (due < today) {
                    isPassed = false;
                    reason = `기한 만료 (${dueDate})`;
                }
            }

            // 2.2 사이별 조건 체크
            if (isPassed) {
                if (isLH) {
                    if (area && area <= 45) {
                        isPassed = false;
                        reason = `면적 45㎡ 이하 (${area}㎡)`;
                    }
                } else {
                    // 청약홈
                    if (area && area <= 45) {
                        isPassed = false;
                        reason = `면적 45㎡ 이하 (${area}㎡)`;
                    } else if (price && price > 700000000) {
                        isPassed = false;
                        reason = `분양가 7억 초과 (${(price / 100000000).toFixed(1)}억)`;
                    }
                }
            }

            return {
                site,
                title: fileName,
                path: filePath,
                area,
                price,
                dueDate,
                isPassed,
                reason,
                summary: isPassed ? this.generateSummary(text) : undefined
            };
        } catch (error) {
            console.error(`[Analyzer] 파일 분석 실패: ${fileName}`, error);
            return null;
        }
    }

    private extractArea(text: string): number | undefined {
        // 면적 추출 정규표현식 (전용면적, 공급면적 등)
        const match = text.match(/(\d{2,3}(?:\.\d+)?)\s*(?:㎡|제곱미터)/);
        return match ? parseFloat(match[1]) : undefined;
    }

    private extractPrice(text: string): number | undefined {
        let prices: number[] = [];

        // 1. "공급금액", "분양가" 등 키워드 다음에 오는 금액 및 단위 찾기
        const keywordPriceMatches = text.matchAll(/(?:공급금액|분양가|총 분양가|총분양가|공급가격|분양 가격)\s*[:\-\s]*([\d,\s]+)\s*(원|만원|억원)?/gi);
        for (const match of keywordPriceMatches) {
            let priceStr = match[1].replace(/,|\s/g, '');
            let price = parseInt(priceStr);

            if (isNaN(price)) continue;

            const unit = (match[2] || '').toLowerCase(); // 단위 부분만 참조
            if (unit.includes('억원')) price *= 100000000;
            else if (unit.includes('만원')) price *= 10000;
            // '원'은 변환 없음

            prices.push(price);
        }
        
        // 2. 테이블 형태에서 직접 금액만 뽑는 경우 (단위가 명시되지 않은 순수 금액)
        // 이 경우는 주변에 '공급금액' 등의 키워드가 없지만 숫자가 큰 경우
        // 예: 288,500,000
        const barePriceMatches = text.matchAll(/(\d{1,3}(?:,\d{3}){2,3})/g);
        for (const match of barePriceMatches) {
            let priceStr = match[1].replace(/,/g, '');
            let price = parseInt(priceStr);
            if (!isNaN(price) && price > 10000000) { // 1천만원 이상의 큰 숫자만 유효한 분양가로 간주
                 // 주변에 "억", "만원" 등의 명시적 단위가 없으면 원으로 간주 (기본값)
                prices.push(price);
            }
        }

        // 추출된 금액 중 가장 낮은 금액을 반환
        if (prices.length > 0) {
            return Math.min(...prices.filter(p => p > 10000000)); // 너무 작은 금액 필터링
        }

        return undefined;
    }

    private extractDueDate(text: string): string | undefined {
        let foundDates: string[] = [];
        const currentDate = new Date();
        currentDate.setHours(0, 0, 0, 0); // 오늘 날짜의 0시 0분 0초로 설정

        // 1. "청약 접수" 키워드 주변에서 날짜 범위 추출 시도 (YYYY.MM.DD)
        // 시작일 ~ 종료일 형태에서 종료일을 우선적으로 찾음
        const applyDateRangeMatch = text.match(/청약\s*접수\s*(?:기간)?\s*[:\-\s]*(\d{4}[\.\-\/]\d{2}[\.\-\/]\d{2})\s*[~\-]\s*(\d{4}[\.\-\/]\d{2}[\.\-\/]\d{2})/);
        if (applyDateRangeMatch && applyDateRangeMatch[2]) {
            foundDates.push(applyDateRangeMatch[2]); // 범위의 마지막 날짜
        } else {
            // 범위가 없는 단일 청약 접수일
            const applyDateSingleMatch = text.match(/청약\s*접수\s*(?:일|기간)?\s*[:\-\s]*(\d{4}[\.\-\/]\d{2}[\.\-\/]\d{2})/);
            if (applyDateSingleMatch) foundDates.push(applyDateSingleMatch[1]);
        }


        // 2. "당첨자 발표일" 추출 시도 (가장 중요한 마감일 중 하나)
        const announceDateMatch = text.match(/(?:당첨자\s*발표일|발표일)\s*[:\-\s]*(\d{4}[\.\-\/]\d{2}[\.\-\/]\d{2})/);
        if (announceDateMatch) {
            foundDates.push(announceDateMatch[1]);
        }

        // 3. 그 외 "마감", "일시", "기한" 키워드 주변에서 날짜 추출 시도
        const generalDateMatches = text.matchAll(/(?:마감|일시|기한)\D*?(\d{4}[\.\-\/]\d{2}[\.\-\/]\d{2})/g);
        for (const match of generalDateMatches) {
            foundDates.push(match[1]);
        }

        if (foundDates.length > 0) {
            const uniqueDates = Array.from(new Set(foundDates)).map(d => {
                const date = new Date(d.replace(/\./g, '-'));
                return isNaN(date.getTime()) ? null : date;
            }).filter(d => d !== null) as Date[];

            // 유효하고 현재 또는 미래 날짜만 필터링
            const futureOrCurrentDates = uniqueDates.filter(d => d && d >= currentDate);
            
            if (futureOrCurrentDates.length > 0) {
                futureOrCurrentDates.sort((a, b) => a.getTime() - b.getTime());
                const closestFutureDate = futureOrCurrentDates[0]; // 가장 가까운 미래/현재 날짜
                return `${closestFutureDate.getFullYear()}.${String(closestFutureDate.getMonth() + 1).padStart(2, '0')}.${String(closestFutureDate.getDate()).padStart(2, '0')}`;
            } else if (uniqueDates.length > 0) {
                // 미래 날짜가 없으면 가장 최근(과거) 날짜라도 반환 (이미 마감된 공고 처리용)
                uniqueDates.sort((a, b) => b.getTime() - a.getTime());
                const latestPastDate = uniqueDates[0];
                return `${latestPastDate.getFullYear()}.${String(latestPastDate.getMonth() + 1).padStart(2, '0')}.${String(latestPastDate.getDate()).padStart(2, '0')}`;
            }
        }
        
        return undefined;
    }

    private generateSummary(text: string): string {
        // 텍스트에서 주요 키워드 요약 (초안 버전)
        const sentences = text.split(/[.\n]/).filter(s => s.trim().length > 10);
        return sentences.slice(0, 3).join('. ').trim();
    }
}
