import { chromium, Page, Browser, BrowserContext, Frame, Download } from 'playwright';
import { db } from '../database/schema';
import * as path from 'path';
import * as fs from 'fs';

export class HomeScraper {
    private url: string = 'https://www.applyhome.co.kr/ai/aib/selectSubscrptCalenderView.do';
    private baseDownloadDir: string = path.resolve(process.cwd(), 'backend/data/downloads/CheongyakHome');
    public onProgress?: (progress: number, status: string) => void;

    async scrape(): Promise<void> {
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

            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            let continueSearching = true;
            let monthLoopCount = 0;
            const maxMonths = 3; 

            while (continueSearching && monthLoopCount < maxMonths) {
                await this.applyFiltersIfNecessary(targetPage, page);

                const currentYM = await targetPage.evaluate(() => {
                    const year = (document.querySelector('#sel_year') as HTMLSelectElement)?.value || new Date().getFullYear().toString();
                    const month = document.querySelector('.cal_bottom li.active')?.textContent?.replace('월', '').trim() || (new Date().getMonth() + 1).toString();
                    return { year: parseInt(year), month: parseInt(month) };
                });
                
                const noticePattern = /\d{4}년 \d{2}월 \d{1,2}일.+/;
                const noticeElements = targetPage.locator('.cal_lb, a').filter({ 
                    hasText: noticePattern
                }).filter({ visible: true });
                
                const count = await noticeElements.count();
                let lastNoticeDayInMonth = 0;

                for (let i = 0; i < count; i++) {
                    const overallProgress = ((monthLoopCount / maxMonths) * 100) + (((i + 1) / count) * (100 / maxMonths));
                    const label = noticeElements.nth(i);
                    const fullText = (await label.textContent())?.trim() || '';
                    const title = fullText.replace(/^\d{4}년 \d{2}월 \d{1,2}일/, '').trim();
                    
                    this.onProgress?.(overallProgress, `${currentYM.month}월: ${title}`);

                    const dayStr = await label.evaluate((el) => el.closest('td')?.querySelector('span')?.textContent?.trim());
                    if (!dayStr || isNaN(parseInt(dayStr))) continue;

                    const dayNum = parseInt(dayStr);
                    const noticeDate = new Date(currentYM.year, currentYM.month - 1, dayNum);
                    if (dayNum > lastNoticeDayInMonth) lastNoticeDayInMonth = dayNum;

                    if (noticeDate < today) continue;

                    const dateDir = path.join(this.baseDownloadDir, noticeDate.getFullYear().toString(), String(noticeDate.getMonth() + 1).padStart(2, '0'), String(noticeDate.getDate()).padStart(2, '0'));
                    if (!fs.existsSync(dateDir)) fs.mkdirSync(dateDir, { recursive: true });

                    await this.processNoticeStrictly(targetPage, page, label, dateDir, title.replace(/[/\\?%*:|"<>]/g, '-'));
                }

                const lastDayOfMonth = new Date(currentYM.year, currentYM.month, 0).getDate();
                if (lastNoticeDayInMonth >= lastDayOfMonth - 2 || (monthLoopCount === 0 && count > 0)) {
                    const moveResult = await this.goToNextMonth(targetPage, page);
                    continueSearching = moveResult.success;
                    if (continueSearching) monthLoopCount++;
                } else {
                    continueSearching = false;
                }
            }
            this.onProgress?.(100, '수집 완료');
        } catch (error) {
        } finally {
            await browser.close();
        }
    }

    private async applyFiltersIfNecessary(targetPage: Frame | Page, page: Page) {
        const needsUpdate = await targetPage.evaluate(() => {
            const kwa = document.querySelector('.ji_kwa')?.classList.contains('cal_active');
            const se = document.getElementById('ji_se')?.classList.contains('cal_active');
            return kwa || !se;
        });

        if (needsUpdate) {
            await targetPage.evaluate(() => {
                const clickByText = (t: string) => (Array.from(document.querySelectorAll('button, a, span')).find(e => e.textContent?.trim() === t) as HTMLElement)?.click();
                clickByText('공급지역');
                (document.querySelector('.ji_kwa') as HTMLElement)?.click();
                (document.querySelector('.ji_do') as HTMLElement)?.click();
                const se = document.getElementById('ji_se'); if (se && !se.classList.contains('cal_active')) se.click();
                const gy = document.getElementById('ji_kyengk'); if (gy && !gy.classList.contains('cal_active')) gy.click();
            });
            await page.waitForTimeout(4000);
        }
    }

    private async processNoticeStrictly(targetPage: Frame | Page, page: Page, label: any, dateDir: string, safeTitle: string) {
        const finalPath = path.join(dateDir, `${safeTitle}.pdf`);
        if (fs.existsSync(finalPath)) return;

        try {
            await label.evaluate((el: HTMLElement) => el.click());
            const iframe = await targetPage.waitForSelector('#iframeDialog', { state: 'visible', timeout: 10000 });
            const frame = await iframe.contentFrame();
            if (frame) {
                await frame.waitForSelector('button, a', { timeout: 8000 }).catch(() => {});
                const downloadBtn = frame.locator('button, a').filter({ hasText: '모집공고문 보기' }).first();
                if (await downloadBtn.count() > 0) {
                    const downloadPromise = page.waitForEvent('download', { timeout: 20000 });
                    await downloadBtn.click({ force: true });
                    const download = await downloadPromise;
                    await download.saveAs(finalPath);
                }
            }
        } catch (err) {} finally {
            await this.forceClosePopup(targetPage);
            await page.waitForTimeout(1000);
        }
    }

    private async forceClosePopup(targetPage: Frame | Page) {
        await targetPage.evaluate(() => {
            (document.querySelector('.ui-dialog-titlebar-close, .btn-close, .btn_layer_close') as HTMLElement)?.click();
            document.querySelectorAll('.ui-dialog, #divForPopup, .ui-widget-overlay').forEach(el => el.remove());
        });
        try { await targetPage.waitForSelector('#iframeDialog', { state: 'hidden', timeout: 3000 }); } catch (e) {}
    }

    private async goToNextMonth(targetPage: Frame | Page, page: Page): Promise<{ success: boolean }> {
        const success = await targetPage.evaluate(() => {
            const list = Array.from(document.querySelectorAll('.cal_bottom li'));
            const idx = list.findIndex(li => li.classList.contains('active'));
            if (idx === -1) return false;
            let targetBtn: HTMLElement | null = null;
            if (idx === 11) {
                const nextYear = document.querySelector('#nextYear')?.parentElement as HTMLElement;
                if (nextYear) { nextYear.click(); targetBtn = list[0].querySelector('button'); }
            } else {
                targetBtn = list[idx + 1].querySelector('button');
            }
            if (targetBtn) { targetBtn.click(); return true; }
            return false;
        });
        if (success) {
            await page.waitForTimeout(5000);
            await targetPage.waitForSelector('.cal_lb, td span', { timeout: 15000 }).catch(() => {});
            return { success: true };
        }
        return { success: false };
    }
}
