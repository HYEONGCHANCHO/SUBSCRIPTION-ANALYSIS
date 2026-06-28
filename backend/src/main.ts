import { initializeDatabase } from './database/schema';
import { HomeScraper } from './scrapers/home-scraper';
import { LHScraper } from './scrapers/lh-scraper';
import { IScraper } from './scrapers/scraper-interface';
import * as readline from 'readline'; // Analyzer 임포트 제거

// 선명한 표준 무지개 색상 (256 색상 코드)
const rainbowColors = [
    '\x1b[38;5;196m', // 1. 빨강
    '\x1b[38;5;208m', // 2. 주황
    '\x1b[38;5;226m', // 3. 노랑
    '\x1b[38;5;46m',  // 4. 초록
    '\x1b[38;5;21m',  // 5. 파랑
    '\x1b[38;5;20m',  // 6. 남색
    '\x1b[38;5;129m', // 7. 보라
];
const reset = '\x1b[0m';

function drawThinRainbowBar(progress: number, width: number = 28): string {
    const filledCount = Math.floor((progress / 100) * width);
    let bar = '';
    for (let i = 0; i < width; i++) {
        // 현재 위치(i)를 기준으로 7가지 색상 중 하나를 결정 (Stretched Rainbow)
        const colorIdx = Math.floor((i / width) * rainbowColors.length);
        const color = rainbowColors[Math.min(colorIdx, rainbowColors.length - 1)];
        
        if (i < filledCount) {
            bar += `${color}━${reset}`;
        } else {
            // 채워지지 않은 부분은 어두운 회색
            bar += `\x1b[38;5;236m━${reset}`;
        }
    }
    return bar;
}

function truncateStatus(text: string, maxLength: number = 15): string {
    if (!text) return ''.padEnd(maxLength + 3);
    const cleaned = text.replace(/[\n\r]/g, '').trim();
    if (cleaned.length <= maxLength) return cleaned.padEnd(maxLength + 3);
    return cleaned.substring(0, maxLength) + '...';
}

async function main() {
    // 화면 초기화 및 커서 숨기기
    process.stdout.write('\x1b[?25l\x1b[2J\x1b[H');
    
    try {
        initializeDatabase();

        const argument = (process.argv[2] || 'ALL').toUpperCase();
        const activeScrapers: { name: string, progress: number, status: string, line: number }[] = [];

        if (argument === 'ALL' || argument === 'HOME') {
            activeScrapers.push({ name: '🏠 청약홈', progress: 0, status: '대기 중...', line: 1 });
        }
        if (argument === 'ALL' || argument === 'LH') {
            activeScrapers.push({ name: '🏢 LH청약', progress: 0, status: '대기 중...', line: 2 });
        }

        const updateUI = () => {
            activeScrapers.forEach((s) => {
                readline.cursorTo(process.stdout, 0, s.line);
                readline.clearLine(process.stdout, 0);
                
                const bar = drawThinRainbowBar(s.progress);
                
                // 텍스트 색상은 현재 진행도에 맞는 무지개 색상 중 하나로 선택
                const colorIdx = Math.floor((s.progress / 100) * (rainbowColors.length - 1));
                const textColor = s.progress > 0 ? rainbowColors[colorIdx] : reset;
                
                const nameText = `${s.name.padEnd(8)}`;
                const progressText = `${textColor}${s.progress.toFixed(1).padStart(5)}%${reset}`;
                const statusText = `\x1b[90m[${truncateStatus(s.status)}]\x1b[0m`;
                
                process.stdout.write(`${nameText} ${bar} ${progressText} ${statusText}`);
            });
        };

        const scrapers = activeScrapers.map((s) => {
            let instance: any;
            if (s.name.includes('청약홈')) instance = new HomeScraper();
            else instance = new LHScraper();

            (instance as any).onProgress = (progress: number, status: string) => {
                s.progress = Math.min(progress, 100);
                s.status = status;
                updateUI();
            };
            return instance;
        });

        updateUI();

        await Promise.all(scrapers.map(async (scraper: any) => {
            try { await scraper.scrape(); } catch (e) {}
        }));

        // 스크래핑 완료 후 분석 로직 제거
        readline.cursorTo(process.stdout, 0, activeScrapers.length + 1);
        process.stdout.write('\x1b[?25h'); // 커서 복구
        console.log('\n\x1b[1;32m✅ 데이터 수집 완료\x1b[0m\n'); 

    } catch (error) {
        process.stdout.write('\x1b[?25h');
        console.error('\n[Main Error]', error);
        process.exit(1);
    }
}

main();
