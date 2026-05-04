function getTargetDates(count = 2) {
    const dates = [];
    const now = new Date();
    
    // 타임존에 관계없이 한국 시간 기준의 날짜 객체 생성
    const kstStr = now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' });
    const kstDate = new Date(kstStr);
    
    let current = new Date(kstDate.getFullYear(), kstDate.getMonth(), kstDate.getDate());

    while (dates.length < count) {
        const day = current.getDay();
        // 토(6), 일(0) 제외하고 영업일만 추출 (사용자 필요에 따라 조정 가능)
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
