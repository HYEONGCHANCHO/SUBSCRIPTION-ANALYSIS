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
        // "공급금액", "분양가", "총 분양가" 등 다양한 키워드 뒤에 오는 금액을 찾도록 보강
        // 금액은 숫자와 콤마로 이루어지고, 원, 만원, 억원 등으로 끝날 수 있음.
        // 혹은 단순히 숫자만 있는 경우도 고려
        const priceMatches = text.matchAll(/(?:공급금액|분양가|총 분양가|총분양가|공급가격|분양 가격)\D*?([\d,\s]+)(?:원|만원|억원)?/gi);
        let prices: number[] = [];

        for (const match of priceMatches) {
            let priceStr = match[1].replace(/,|\s/g, ''); // 콤마와 공백 제거
            let price = parseInt(priceStr);

            if (isNaN(price)) continue;

            // 단위 처리 (매치된 전체 문자열에서 단위 확인)
            const unit = (match[0] || '').toLowerCase();
            if (unit.includes('억원')) price *= 100000000;
            else if (unit.includes('만원')) price *= 10000;

            prices.push(price);
        }
        
        // 추가적으로 테이블 형태에서 직접 금액만 뽑는 경우 (단위가 명시되지 않은 순수 금액)
        // 500,030,000 와 같은 패턴 찾기
        const barePriceMatches = text.matchAll(/(\d{1,3}(?:,\d{3}){2,3})/g); // 수억 ~ 수백억 단위 숫자 패턴
        for (const match of barePriceMatches) {
            let priceStr = match[1].replace(/,/g, '');
            let price = parseInt(priceStr);
            if (!isNaN(price)) prices.push(price);
        }

        // 추출된 금액 중 가장 낮은 금액을 반환 (다양한 타입 중 최저가를 보통 관심 있어 하므로)
        if (prices.length > 0) {
            return Math.min(...prices.filter(p => p > 10000000)); // 너무 작은 금액(오기)은 제외하고 1천만원 이상만
        }

        return undefined;
    }

    private extractDueDate(text: string): string | undefined {
        // "청약 접수", "접수 마감", "당첨자 발표" 등에서 날짜 추출
        // YYYY.MM.DD 또는 YYYY-MM-DD 형식 (날짜 범위에서 마지막 날짜 우선)
        const dateRegex = /(\d{4}[\.\-\/]\d{2}[\.\-\/]\d{2})/g;
        
        let foundDates: string[] = [];

        // "청약 접수" 키워드 주변에서 날짜 범위 추출 시도
        const applyDateMatch = text.match(/청약\s*접수\s*(?:기간)?\s*:\s*(\d{4}[\.\-\/]\d{2}[\.\-\/]\d{2})\s*(?:[~\-]\s*(\d{4}[\.\-\/]\d{2}[\.\-\/]\d{2}))?/);
        if (applyDateMatch) {
            if (applyDateMatch[2]) foundDates.push(applyDateMatch[2]); // 범위가 있으면 마지막 날짜
            else foundDates.push(applyDateMatch[1]); // 범위가 없으면 단일 날짜
        }

        // 그 외 "마감", "발표" 키워드 주변에서 날짜 추출 시도 (가장 최신 날짜를 선택하기 위해)
        const generalDateMatches = text.matchAll(/(?:마감|발표|일시|기한)\D*?(\d{4}[\.\-\/]\d{2}[\.\-\/]\d{2})/g);
        for (const match of generalDateMatches) {
            foundDates.push(match[1]);
        }

        // 찾은 날짜들 중 가장 미래의 날짜(즉, 가장 최신 마감일일 가능성)를 선택
        if (foundDates.length > 0) {
            // 중복 제거 및 유효한 날짜로 파싱
            const uniqueDates = Array.from(new Set(foundDates)).map(d => new Date(d.replace(/\./g, '-')));
            const futureDates = uniqueDates.filter(d => !isNaN(d.getTime()) && d >= new Date()); // 유효하고 미래 날짜만
            
            if (futureDates.length > 0) {
                futureDates.sort((a, b) => a.getTime() - b.getTime());
                const latestDate = futureDates[0]; // 가장 가까운 미래 날짜
                return `${latestDate.getFullYear()}.${String(latestDate.getMonth() + 1).padStart(2, '0')}.${String(latestDate.getDate()).padStart(2, '0')}`;
            } else {
                // 미래 날짜가 없으면 가장 최근(과거) 날짜라도 반환 (이미 마감된 공고 처리용)
                uniqueDates.sort((a, b) => b.getTime() - a.getTime());
                const pastDate = uniqueDates[0];
                if (!isNaN(pastDate.getTime())) {
                    return `${pastDate.getFullYear()}.${String(pastDate.getMonth() + 1).padStart(2, '0')}.${String(pastDate.getDate()).padStart(2, '0')}`;
                }
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
