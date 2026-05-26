const { execSync } = require('child_process');
const files = [
    "backend/data/downloads/CheongyakHome/2026/05/27/신림스카이아파트(19차).pdf",
    "backend/data/downloads/CheongyakHome/2026/05/27/용인 고림 동문 디 이스트.pdf",
    "backend/data/downloads/CheongyakHome/2026/05/27/오남역 서희스 타힐스 여의재 3단지.pdf",
    "backend/data/downloads/CheongyakHome/2026/05/27/엘리프 역곡.pdf",
    "backend/data/downloads/CheongyakHome/2026/05/27/래미안 엘라비 네(2차).pdf",
    "backend/data/downloads/CheongyakHome/2026/05/27/힐스테이트 시 흥더클래스.pdf",
    "backend/data/downloads/CheongyakHome/2026/05/27/아크로 리버스 카이.pdf",
    "backend/data/downloads/CheongyakHome/2026/05/26/써밋 더힐.pdf",
    "backend/data/downloads/CheongyakHome/2026/05/26/식사 푸르지오 파크센트(조합원 취소분).pdf",
    "backend/data/downloads/CheongyakHome/2026/05/26/라클라체자이드파인.pdf",
    "backend/data/downloads/CheongyakHome/2026/05/26/야목역 서희스 타힐스 그랜드힐.pdf"
];

for (const file of files) {
    try {
        console.log(`\n=== 분석 파일: ${file.split('/').pop()} ===`);
        const text = execSync(`node extract_text.js "${file}"`, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
        
        const lines = text.split('\n');
        
        // 1. 주요 헤더/목차 추출
        const headers = lines.filter(line => 
            /^(■|▣|□|○|[\d]\.)\s*(공급|청약|신청|유의|재당첨|전매|계약|분양|주택|모집)/.test(line.trim())
        ).map(line => line.trim()).slice(0, 10);
        console.log("-> [발견된 주요 헤더 패턴]");
        console.log(headers.join('\n'));

        // 2. '위치' 키워드 근처
        const locIdx = lines.findIndex(line => line.includes('위치'));
        if (locIdx !== -1) {
            console.log("-> ['위치' 주변 텍스트]");
            console.log(lines.slice(Math.max(0, locIdx - 1), locIdx + 2).join('\n'));
        } else {
            console.log("-> ['위치' 키워드 없음]");
        }
        
    } catch(e) {
        console.log(`Error processing ${file}: ${e.message.substring(0, 100)}`);
    }
}
