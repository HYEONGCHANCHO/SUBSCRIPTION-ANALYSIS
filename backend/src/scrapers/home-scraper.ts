import { chromium, Page, Browser, BrowserContext, Frame, Download } from 'playwright';
import { db } from '../database/schema';
import * as path from 'path';
import * as fs from 'fs';
import { getTargetDates } from '../utils/date-utils';

export class HomeScraper {
    private url: string = 'https://www.applyhome.co.kr/ai/aib/selectSubscrptCalenderView.do';
    private baseDownloadDir: string = path.resolve(process.cwd(), 'backend/data/downloads/CheongyakHome');
    public onProgress?: (progress: number, status: string) => void;

    private getDatesToScrape(): string[] {
        try {
            if (fs.existsSync('dates.json')) {
                const data = JSON.parse(fs.readFileSync('dates.json', 'utf8'));
                return [data.d1, data.d2].filter(Boolean);
            }
        } catch (e) {}
        return getTargetDates(2);
    }

    async scrape(): Promise<void> {
        const targetDates = this.getDatesToScrape();
        console.log(`[HomeScraper] 수집 대상 날짜: ${targetDates.join(', ')}`);
        const lastTargetDate = new Date(targetDates[targetDates.length - 1]);
        
        const browser: Browser = await chromium.launch({ headless: true }); 
        const context: BrowserContext = await browser.newContext({
            viewport: { width: 1280, height: 1000 },
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        });
        const page: Page = await context.newPage();

        try {
            await page.goto(this.url, { waitUntil: 'networkidle' });
            
            let targetPage: Frame | Page = page;
            for (const frame of page.frames()) {
                try {
                    if ((await frame.content()).includes('공급지역')) {
                        targetPage = frame;
                        break;
                    }
                } catch (e) {}
            }

            let continueSearching = true;
            let monthLoopCount = 0;
            const maxMonths = 3; // 미래 날짜 조회를 위해 3개월까지 허용

            while (continueSearching && monthLoopCount < maxMonths) {
                const currentYM = await targetPage.evaluate(() => {
                    const year = (document.querySelector('#sel_year') as HTMLSelectElement)?.value || new Date().getFullYear().toString();
                    const month = document.querySelector('.cal_bottom li.active')?.textContent?.replace('월', '').trim() || (new Date().getMonth() + 1).toString();
                    return { year: parseInt(year), month: parseInt(month) };
                });
                
                const dayCells = targetPage.locator('td');
                const cellCount = await dayCells.count();
                
                for (let i = 0; i < cellCount; i++) {
                    const cell = dayCells.nth(i);
                    const cellText = (await cell.innerText()) || '';
                    const dayMatch = cellText.match(/^(\d{1,2})/);
                    if (!dayMatch) continue;

                    const dayNum = parseInt(dayMatch[1]);
                    const lines = cellText.split('\n')
                        .map(l => l.trim())
                        .filter(l => l.length > 2 && !/^\d+$/.test(l) && !l.includes('월'));

                    for (const title of lines) {
                        const noticeDate = new Date(currentYM.year, currentYM.month - 1, dayNum);
                        const dateStr = `${noticeDate.getFullYear()}-${String(noticeDate.getMonth() + 1).padStart(2, '0')}-${String(noticeDate.getDate()).padStart(2, '0')}`;
                        
                        if (!targetDates.includes(dateStr)) continue;

                        console.log(`[HomeScraper] 수집 시작: ${dateStr} - ${title}`);
                        this.onProgress?.(((i + 1) / cellCount) * 100, `${currentYM.month}월: ${title}`);

                        const dateDir = path.join(this.baseDownloadDir, noticeDate.getFullYear().toString(), String(noticeDate.getMonth() + 1).padStart(2, '0'), String(noticeDate.getDate()).padStart(2, '0'));
                        if (!fs.existsSync(dateDir)) fs.mkdirSync(dateDir, { recursive: true });

                        const clickable = cell.locator('a, span.cal_lb, span.cal_st').filter({ hasText: title.substring(0, 10) }).first();
                        if (await clickable.count() > 0) {
                            await this.processNoticeStrictly(targetPage, page, clickable, dateDir, title.replace(/[/\\?%*:|"<>]/g, '-'));
                        }
                    }
                }
                
                // 달력의 마지막 날짜가 타겟 마지막 날짜보다 작으면 다음 달로
                const lastDayInMonth = new Date(currentYM.year, currentYM.month, 0);
                if (lastDayInMonth >= lastTargetDate) {
                    continueSearching = false;
                } else {
                    const moveResult = await this.goToNextMonth(targetPage, page);
                    continueSearching = moveResult.success;
                    if (continueSearching) monthLoopCount++;
                }
            }
        } catch (error) {
            console.error('[HomeScraper Error]', error);
        } finally {
            await browser.close();
        }
    }

    private async processNoticeStrictly(targetPage: Frame | Page, page: Page, label: any, dateDir: string, safeTitle: string) {
        const finalPath = path.join(dateDir, `${safeTitle}.pdf`);
        if (fs.existsSync(finalPath)) return;

        try {
            await label.click({ force: true });
            // 1. 팝업창 나타날 때까지 충분히 대기
            const iframe = await targetPage.waitForSelector('#iframeDialog', { state: 'visible', timeout: 20000 });
            const frame = await iframe.contentFrame();
            
            if (frame) {
                console.log(`   └ [${safeTitle}] 팝업 로드 완료, 버튼 탐색 중...`);
                // 2. 프레임 내부 로딩 대기
                await frame.waitForLoadState('networkidle');
                await frame.waitForSelector('button, a', { timeout: 15000 });

                // 3. 버튼 찾기 (텍스트 패턴 다양화)
                const downloadBtn = frame.locator('button, a').filter({ 
                    hasText: /모집공고문 보기|입주자모집공고문|공고문 보기|공고문|PDF/ 
                }).first();
                
                if (await downloadBtn.count() > 0) {
                    await downloadBtn.scrollIntoViewIfNeeded();
                    const downloadPromise = page.waitForEvent('download', { timeout: 40000 });
                    await downloadBtn.click({ force: true });
                    const download = await downloadPromise;
                    await download.saveAs(finalPath);
                    console.log(`   └ [${safeTitle}] 다운로드 성공!`);
                } else {
                    console.log(`   └ [${safeTitle}] 공고문 버튼을 찾을 수 없음 (아직 게시 전일 수 있음)`);
                }
            }
        } catch (err: any) {
            console.error(`   └ [${safeTitle}] 실패: ${err.message}`);
        } finally {
            await this.forceClosePopup(targetPage);
            await page.waitForTimeout(1500);
        }
    }

    private async forceClosePopup(targetPage: Frame | Page) {
        try {
            await targetPage.evaluate(() => {
                const closeBtn = Array.from(document.querySelectorAll('button, a, span')).find(el => el.textContent?.trim() === '닫기') as HTMLElement;
                if (closeBtn) closeBtn.click();
            });
        } catch (e) {}
    }

    private async goToNextMonth(targetPage: Frame | Page, page: Page): Promise<{ success: boolean }> {
        try {
            await targetPage.evaluate(() => {
                const nextBtn = document.querySelector('.cal_top .next') as HTMLElement;
                if (nextBtn) nextBtn.click();
            });
            await page.waitForTimeout(4000);
            return { success: true };
        } catch (e) {
            return { success: false };
        }
    }
}
