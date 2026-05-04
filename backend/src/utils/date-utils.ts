export function getTargetDates(count: number = 2): string[] {
    const dates: string[] = [];
    const now = new Date();
    
    // 시스템 현지 시간 기준 (노트북 시간)
    let current = new Date(now.getFullYear(), now.getMonth(), now.getDate());

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
    const normalized = dateStr.replace(/[.\-/년월일\s]/g, '-').replace(/-+/g, '-');
    const match = normalized.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return false;
    const formatted = `${match[1]}-${match[2]}-${match[3]}`;
    return targetDates.includes(formatted);
}
