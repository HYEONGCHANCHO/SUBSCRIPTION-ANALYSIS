const https = require('https');

function getKstFromNetwork() {
    return new Promise((resolve) => {
        https.get('https://worldtimeapi.org/api/timezone/Asia/Seoul', (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve(new Date(json.datetime));
                } catch (e) {
                    // 네트워크 실패 시 로컬 보정 방식 사용 (Fallback)
                    resolve(new Date(new Date().getTime() + (9 * 60 * 60 * 1000)));
                }
            });
        }).on('error', () => {
            resolve(new Date(new Date().getTime() + (9 * 60 * 60 * 1000)));
        });
    });
}

function isWeekend(date) {
    const day = date.getDay();
    return day === 0 || day === 6;
}

async function run() {
    let dates = [];
    let current = await getKstFromNetwork();
    
    while (dates.length < 2) {
        if (!isWeekend(current)) {
            dates.push(current.toISOString().split('T')[0]);
        }
        current.setDate(current.getDate() + 1);
    }
    console.log(dates.join(','));
}

run();
