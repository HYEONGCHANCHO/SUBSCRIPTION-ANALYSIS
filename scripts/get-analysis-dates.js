function getTargetDates(count = 2) {
    const dates = [];
    const now = new Date();
    
    // 시스템 현지 시간 기준 (노트북 시간)
    let current = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    while (dates.length < count) {
        const day = current.getDay();
        // 토(6), 일(0) 제외 (필요 시 조정)
        if (day !== 0 && day !== 6) {
            const y = current.getFullYear();
            const m = String(current.getMonth() + 1).padStart(2, '0');
            const d = String(current.getDate()).padStart(2, '0');
            dates.push(`${y}-${m}-${d}`);
        }
        current.setDate(current.getDate() + 1);
    }
    return dates;
}

const dates = getTargetDates(2);
console.log(dates.join(','));
