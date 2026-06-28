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
            const data = await pdf(dataBuffer, { max: 5 }); 
            const text = data.text;

            const area = this.extractArea(text);
            const price = this.extractPrice(text);
            const dueDate = this.extractDueDate(text);

            let isPassed = true;
            let reason = '';

            if (dueDate) {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const due = new Date(dueDate.replace(/\./g, '-'));
                if (due < today) {
                    isPassed = false;
                    reason = `기한 만료 (${dueDate})`;
                }
            }

            if (isPassed) {
                if (isLH) {
                    if (area && area <= 45) {
                        isPassed = false;
                        reason = `면적 45㎡ 이하 (${area}㎡)`;
                    }
                } else {
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
        const match = text.match(/(\d{2,3}(?:\.\d+)?)\s*(?:㎡|제곱미터)/);
        return match ? parseFloat(match[1]) : undefined;
    }

    private extractPrice(text: string): number | undefined {
        // 분양가 추출 (단위: 원, 만원, 억원 등 대응)
        const match = text.match(/분양가.*?([\d,]+)\s*(?:원|만원|억원)/);
        if (!match) return undefined;
        
        let priceStr = match[1].replace(/,/g, '');
        let price = parseInt(priceStr);
        
        // 텍스트 내에 "억원"이 명시적으로 포함된 경우에만 억 단위로 처리
        if (match[0].includes('억원')) price *= 100000000;
        else if (match[0].includes('만원')) price *= 10000; // "만원"이 포함된 경우
        // "원" 단위는 그대로 사용

        return price;
    }

    private extractDueDate(text: string): string | undefined {
        // 기한 추출 (청약 접수 마감일 등)
        const match = text.match(/(?:접수|마감|기한).*?(\d{4}[\.\-\/]\d{2}[\.\-\/]\d{2})/);
        return match ? match[1].replace(/[-\/]/g, '.') : undefined;
    }

    private generateSummary(text: string): string {
        const sentences = text.split(/[.
]/).filter(s => s.trim().length > 10);
        return sentences.slice(0, 3).join('. ').trim();
    }
}
