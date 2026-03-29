export interface IScraper {
    /**
     * 해당 사이트의 공고를 수집하고 파일을 다운로드합니다.
     */
    scrape(): Promise<void>;
}
