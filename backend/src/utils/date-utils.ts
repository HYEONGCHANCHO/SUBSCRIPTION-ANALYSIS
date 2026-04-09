export function getTargetDates(count: number = 3): string[] {
    const dates: string[] = [];
    const now = new Date();
    // KST 보정 (GitHub Action이 UTC 기준이므로 9시간 더함)
    const kst = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    let current = new Date(kst.getFullYear(), kst.getMonth(), kst.getDate());

    while (dates.length < count) {
        const day = current.getDay();
        // 0: 일요일, 6: 토요일 제외
        if (day !== 0 && day !== 6) {
            const year = current.getFullYear();
            const month = String(current.getMonth() + 1).padStart(2, '0');
            const date = String(current.getDate()).padStart(2, '0');
            dates.push(`${year}-${month}-${date}`);
        }
        // 다음 날로 이동
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
