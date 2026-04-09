import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { getTargetDates } from '../utils/date-utils';
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
    private baseDownloadDir: string = path.resolve(process.cwd(), 'backend/data/downloads');
    private processedHashes: Set<string> = new Set();

    async analyzeAll(): Promise<AnalysisResult[]> {
        const targetDates = getTargetDates(3);
        const results: AnalysisResult[] = [];
        const files = this.getAllFiles(this.baseDownloadDir);
        
        for (const file of files) {
            if (path.extname(file).toLowerCase() !== '.pdf' && path.extname(file).toLowerCase() !== '.hwpx' && path.extname(file).toLowerCase() !== '.hwp') continue;

            // 파일 경로에서 날짜 추출 (YYYY/MM/DD 형태인지 확인)
            const pathParts = file.split(path.sep);
            const datePart = pathParts.slice(-4, -1).join('-'); // YYYY-MM-DD
            if (!targetDates.includes(datePart)) continue;

            const contentHash = this.getFileHash(file);
            if (this.processedHashes.has(contentHash)) continue;
            this.processedHashes.add(contentHash);

            const result = await this.analyzeFile(file);
            if (result) results.push(result);
        }

        return results;
    }

    private getAllFiles(dir: string): string[] {
        let results: string[] = [];
        const list = fs.readdirSync(dir);
        list.forEach((file) => {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            if (stat && stat.isDirectory()) {
                results = results.concat(this.getAllFiles(filePath));
            } else {
                results.push(filePath);
            }
        });
        return results;
    }

    private getFileHash(filePath: string): string {
        const fileBuffer = fs.readFileSync(filePath);
        return crypto.createHash('sha256').update(fileBuffer).digest('hex');
    }

    private async analyzeFile(filePath: string): Promise<AnalysisResult | null> {
        const dataBuffer = fs.readFileSync(filePath);
        const fileName = path.basename(filePath, '.pdf');
        const isLH = filePath.includes('/LH/');
        const site = isLH ? 'LH' : '청약홈';

        try {
            const data = await pdf(dataBuffer);
            const text = data.text;

            // 1. 데이터 추출 (면적, 가격, 기한)
            const area = this.extractArea(text);
            const price = this.extractPrice(text);
            const dueDate = this.extractDueDate(text);

            // 2. 필터링 조건 적용
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
        // 분양가 추출 (단위: 원, 만원, 억원 등 대응)
        const match = text.match(/분양가.*?([\d,]+)\s*(?:원|만원|억원)/);
        if (!match) return undefined;
        
        let priceStr = match[1].replace(/,/g, '');
        let price = parseInt(priceStr);
        
        if (text.includes('억원')) price *= 100000000;
        else if (text.includes('만원')) price *= 10000;
        
        return price;
    }

    private extractDueDate(text: string): string | undefined {
        // 기한 추출 (청약 접수 마감일 등)
        const match = text.match(/(?:접수|마감|기한).*?(\d{4}[\.\-\/]\d{2}[\.\-\/]\d{2})/);
        return match ? match[1].replace(/[-\/]/g, '.') : undefined;
    }

    private generateSummary(text: string): string {
        // 텍스트에서 주요 키워드 요약 (초안 버전)
        const sentences = text.split(/[.\n]/).filter(s => s.trim().length > 10);
        return sentences.slice(0, 3).join('. ').trim();
    }
}
