export function getTargetDates(count: number = 2): string[] {
    const dates: string[] = [];
    const now = new Date();
    
    // KST 기준 날짜 문자열 추출 (YYYY-MM-DD)
    const formatter = new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    
    const parts = formatter.formatToParts(now);
    const y = parts.find(p => p.type === 'year')?.value;
    const m = parts.find(p => p.type === 'month')?.value;
    const d = parts.find(p => p.type === 'day')?.value;
    
    let current = new Date(Number(y), Number(m) - 1, Number(d));

    while (dates.length < count) {
        const day = current.getDay();
        if (day !== 0 && day !== 6) {
            const year = current.getFullYear();
            const month = String(current.getMonth() + 1).padStart(2, '0');
            const date = String(current.getDate()).padStart(2, '0');
            dates.push(`${year}-${month}-${date}`);
        }
        current.setDate(current.getDate() + 1);
    }
    return dates;
}

export function isTargetDate(dateStr: string, targetDates: string[]): boolean {
    // dateStr 형식이 다양할 수 있으므로 (YYYY.MM.DD 등) 정규화하여 비교
    const normalized = dateStr.replace(/[.\-/년월일\s]/g, '-').replace(/-+/g, '-');
    // YYYY-MM-DD 부분만 추출
    const match = normalized.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return false;
    const formatted = `${match[1]}-${match[2]}-${match[3]}`;
    return targetDates.includes(formatted);
}
