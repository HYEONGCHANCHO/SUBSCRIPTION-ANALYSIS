function getTargetDates(count = 3) {
    const dates = [];
    const now = new Date();
    // KST 보정 (GitHub Action 환경 대응)
    const kst = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    let current = new Date(kst.getFullYear(), kst.getMonth(), kst.getDate());

    while (dates.length < count) {
        const day = current.getDay();
        if (day !== 0 && day !== 6) { // 토, 일 제외
            const y = current.getFullYear();
            const m = String(current.getMonth() + 1).padStart(2, '0');
            const d = String(current.getDate()).padStart(2, '0');
            dates.push(`${y}-${m}-${d}`);
        }
        current.setDate(current.getDate() + 1);
    }
    return dates;
}

const dates = getTargetDates(3);
console.log(dates.join(','));
