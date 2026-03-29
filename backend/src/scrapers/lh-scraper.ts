import { chromium, Page, Browser, BrowserContext, Frame, Download } from 'playwright';
import { IScraper } from './scraper-interface';
import * as path from 'path';
import * as fs from 'fs';

export class LHScraper implements IScraper {
    private url: string = 'https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancList.do?mi=1026';
    private baseDownloadDir: string = path.resolve(process.cwd(), 'backend/data/downloads/LH');
    private gyeonggiExcludes = ['부천', '평택', '안성', '구리', '남양주', '양주', '동두천', '하남', '김포', '인천', '파주', '청년 전세임대', '가정어린이집'];
    private seoulExcludes = ['청년 전세임대'];
    public onProgress?: (progress: number, status: string) => void;

    async scrape(): Promise<void> {
        const browser: Browser = await chromium.launch({ headless: true }); 
        const context: BrowserContext = await browser.newContext({
            viewport: { width: 1280, height: 1000 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        });
        const page: Page = await context.newPage();

        try {
            await this.processRegion(page, '경기도', '41', this.gyeonggiExcludes, 0, 80);
            await this.processRegion(page, '서울특별시', '11', this.seoulExcludes, 80, 100);
            this.onProgress?.(100, '수집 완료');
        } catch (error) {
        } finally {
            await browser.close();
        }
    }

    private async processRegion(page: Page, regionName: string, regionValue: string, excludes: string[], startProg: number, endProg: number) {
        this.onProgress?.(startProg + 2, `${regionName} 이동 중...`);
        await page.goto(this.url, { waitUntil: 'networkidle' });

        let target: Frame | Page = page;
        for (const frame of page.frames()) {
            if ((await frame.content()).includes('cnpCd')) {
                target = frame;
                break;
            }
        }

        await target.evaluate((val) => {
            const select = document.getElementById('cnpCd') as HTMLSelectElement;
            if (select) { select.value = val; select.dispatchEvent(new Event('change', { bubbles: true })); }
            const searchBtn = Array.from(document.querySelectorAll('button, a')).find(el => el.textContent?.trim() === '검색') as HTMLElement;
            if (searchBtn) searchBtn.click();
        }, regionValue);

        await page.waitForTimeout(3000); 
        await target.waitForSelector('table tbody tr', { timeout: 10000 }).catch(() => {});

        const rows = target.locator('table tbody tr');
        const count = await rows.count();
        const processedTitles = new Set<string>();

        if (count === 0 || (count === 1 && (await rows.nth(0).textContent())?.includes('결과가 없습니다'))) {
            this.onProgress?.(endProg, `${regionName} 결과 없음`);
            return;
        }

        for (let i = 0; i < count; i++) {
            const stepSize = (endProg - (startProg + 5)) / count;
            const currentProgress = startProg + 5 + (i * stepSize);
            
            const row = rows.nth(i);
            const link = row.locator('a').first();
            if (await link.count() === 0) continue;
            
            const title = (await link.textContent())?.trim() || '';
            if (!title || title.length < 5 || title.includes('결과가 없습니다')) continue;
            if (excludes.some(k => title.includes(k))) {
                this.onProgress?.(currentProgress, `제외: ${title}`);
                continue;
            }
            if (processedTitles.has(title)) continue;
            processedTitles.add(title);

            this.onProgress?.(currentProgress, `${regionName}: ${title}`);
            
            try {
                await link.evaluate((el: HTMLElement) => el.click());
                await page.waitForLoadState('networkidle');
                await page.waitForTimeout(4000);
                
                let detailTarget: Frame | Page = page;
                for (const frame of page.frames()) {
                    const content = await frame.content();
                    if (content.includes('공고일') || content.includes('게시일')) {
                        detailTarget = frame;
                        break;
                    }
                }
                
                const noticeDateInfo = await detailTarget.evaluate(() => {
                    const parseDate = (text: string) => {
                        const dateMatch = text.match(/(\d{4})[\.-년](\d{2})[\.-월](\d{2})[일]?/);
                        return dateMatch ? { y: dateMatch[1], m: dateMatch[2], d: dateMatch[3] } : null;
                    };
                    const ths = Array.from(document.querySelectorAll('th'));
                    const dateTh = ths.find(th => /공고일|게시일/.test(th.textContent || ''));
                    if (dateTh) return parseDate(dateTh.nextElementSibling?.textContent || '');
                    const strongs = Array.from(document.querySelectorAll('strong'));
                    const dateStrong = strongs.find(s => /공고일|게시일/.test(s.textContent || ''));
                    if (dateStrong) return parseDate(dateStrong.parentElement?.textContent || '');
                    const bodyText = document.body.innerText;
                    return parseDate(bodyText.split('공고일')[1] || '') || parseDate(bodyText.split('게시일')[1] || '');
                });
                
                await this.downloadBestFileWithRetry(detailTarget, page, title, noticeDateInfo);
                await page.goBack();
                await page.waitForLoadState('networkidle');
                await page.waitForTimeout(2000);
            } catch (err) {
                await page.goto(this.url);
                await this.reapplyFilter(target, regionValue);
            }
        }
    }

    private async downloadBestFileWithRetry(target: Frame | Page, page: Page, title: string, noticeDate: any) {
        const allLinks = await target.evaluate(() => {
            return Array.from(document.querySelectorAll('a')).map(a => ({
                text: a.textContent?.trim() || '',
                onclick: a.getAttribute('onclick') || '',
                className: a.className
            })).filter(l => l.text.length > 0);
        });
        const best = allLinks.find(l => (l.text.includes('공고문') || l.text.includes('파일')) && /\.(pdf|hwpx|hwp)$/i.test(l.text))
                  || allLinks.find(l => /\.(pdf|hwpx|hwp)$/i.test(l.text))
                  || allLinks.find(l => l.onclick.includes('down') || l.onclick.includes('file'));

        if (best) {
            const dateDir = path.join(this.baseDownloadDir, noticeDate?.y || new Date().getFullYear().toString(), noticeDate?.m || String(new Date().getMonth() + 1).padStart(2, '0'), noticeDate?.d || String(new Date().getDate()).padStart(2, '0'));
            if (!fs.existsSync(dateDir)) fs.mkdirSync(dateDir, { recursive: true });
            const ext = best.text.toLowerCase().includes('.pdf') ? 'pdf' : (best.text.toLowerCase().includes('.hwpx') ? 'hwpx' : 'hwp');
            try {
                const [download] = await Promise.all([
                    page.waitForEvent('download', { timeout: 25000 }),
                    target.locator('a').filter({ hasText: best.text }).first().click({ force: true })
                ]);
                await download.saveAs(path.join(dateDir, `${title.replace(/[/\\?%*:|"<>]/g, '-')}.${ext}`));
            } catch (e) {}
        }
    }

    private async reapplyFilter(target: Frame | Page, val: string) {
        await target.evaluate((v) => {
            const s = document.getElementById('cnpCd') as HTMLSelectElement;
            if (s) { s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); }
            const b = Array.from(document.querySelectorAll('button, a')).find(el => el.textContent?.trim() === '검색') as HTMLElement;
            if (b) b.click();
        }, val);
        await new Promise(r => setTimeout(r, 3000));
    }
}
