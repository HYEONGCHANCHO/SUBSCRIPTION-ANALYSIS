function getKstNow() {
    const now = new Date();
    return new Date(now.getTime() + (9 * 60 * 60 * 1000));
}

function isWeekend(date) {
    const day = date.getUTCDay(); // 0: 일요일, 6: 토요일
    return day === 0 || day === 6;
}

let dates = [];
let current = getKstNow();

// 시간을 00:00:00으로 맞춤 (날짜 비교 정확도)
current.setUTCHours(0, 0, 0, 0);

while (dates.length < 2) {
    if (!isWeekend(current)) {
        dates.push(current.toISOString().split('T')[0]);
    }
    current.setUTCDate(current.getUTCDate() + 1);
}

console.log(dates.join(','));
