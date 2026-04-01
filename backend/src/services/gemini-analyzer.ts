import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

export interface MatchedType {
  type: string;
  area: number | string;
  price: number | string;
  reason: string;
}

export interface AiAnalysisResult {
  isMatch: boolean;
  applyDate: string;
  matchedTypes: MatchedType[];
  eligibility: {
    isEligible: boolean;
    detail: string;
  };
  regulations: {
    transferRestriction: string;
    residenceObligation: string;
  };
  marketAnalysis: {
    attractiveness: string;
  };
  commute: {
    toDongcheon: string;
    toNonhyeon: string;
  };
  summary: string;
}

export class GeminiAnalyzer {
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;
  private configPrompt: string;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    // 쿼터 안정성이 높고 최신 분석 성능을 갖춘 gemini-2.0-flash 모델 사용
    this.model = this.genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    this.configPrompt = this.loadConfig();
  }

  private loadConfig(): string {
    const configPath = path.resolve(process.cwd(), 'analysis-config.md');
    try {
      return fs.readFileSync(configPath, 'utf-8');
    } catch (error) {
      return '부동산 청약 공고문을 분석하여 조건에 맞는 주택형이 있는지 JSON으로 알려주세요.';
    }
  }

  // 요청 간의 지연을 위한 간단한 sleep 함수
  private sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async analyzePdf(filePath: string): Promise<AiAnalysisResult | null> {
    const maxRetries = 3;
    let retryCount = 0;

    while (retryCount < maxRetries) {
      try {
        // 분석 시작 전 기본 1.5초 대기 (유료 티어 안정성 확보)
        await this.sleep(1500);

        const extractorPath = path.resolve(process.cwd(), 'extract_text.js');
        const text = execSync(`node "${extractorPath}" "${filePath}"`, { 
            encoding: 'utf-8', 
            maxBuffer: 1024 * 1024 * 20
        });

        if (!text) throw new Error('No text extracted');

        // Pro 모델의 긴 컨텍스트 지원을 활용하여 분석 정밀도 향상
        const truncatedText = text.substring(0, 60000);

        const prompt = `
${this.configPrompt}
반드시 JSON 형식으로만 응답하세요.

--- 텍스트 ---
${truncatedText}
`;

        const result = await this.model.generateContent(prompt);
        const response = await result.response;
        let jsonText = response.text().trim();
        
        jsonText = jsonText.replace(/```json/g, '').replace(/```/g, '').trim();
        
        try {
          return JSON.parse(jsonText);
        } catch (parseError) {
          console.error(`[JSON Parse Error] ${path.basename(filePath)}: Invalid JSON response`);
          return null;
        }
        
      } catch (error: any) {
        const msg = error.message || 'Unknown error';
        const isRetryable = msg.includes('503') || msg.includes('429') || msg.toLowerCase().includes('quota');
        
        if (isRetryable && retryCount < maxRetries - 1) {
          retryCount++;
          const waitTime = retryCount * 5000;
          console.log(`[Gemini Retry ${retryCount}/${maxRetries}] ${path.basename(filePath)}: ${msg}. Waiting ${waitTime/1000}s...`);
          await this.sleep(waitTime);
          continue;
        }

        console.error(`[Gemini Error] ${path.basename(filePath)}: ${msg}`);
        return null;
      }
    }
    return null;
  }
}