const https = require('https');
const fs = require('fs');
const path = require('path');

const TOKEN_PATH = path.join(__dirname, 'kakao_token.json');
const CLIENT_ID = 'df08177ef1ae98f770df7d05e8239101';

async function refreshToken() {
    if (!fs.existsSync(TOKEN_PATH)) return null;
    const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    const postData = `grant_type=refresh_token&client_id=${CLIENT_ID}&refresh_token=${tokens.refresh_token}`;
    return requestToken(postData);
}

function requestToken(postData) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'kauth.kakao.com', path: '/oauth/token', method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(postData) }
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', d => data += d);
            res.on('end', () => {
                const result = JSON.parse(data);
                if (res.statusCode === 200) {
                    let newTokens = result;
                    if (fs.existsSync(TOKEN_PATH)) {
                        const old = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
                        newTokens = { ...old, ...result };
                    }
                    fs.writeFileSync(TOKEN_PATH, JSON.stringify(newTokens, null, 2));
                    resolve(newTokens);
                } else reject(data);
            });
        });
        req.write(postData);
        req.end();
    });
}

async function sendRequest(tokens, template) {
    const body = `template_object=${encodeURIComponent(JSON.stringify(template))}`;
    const options = {
        hostname: 'kapi.kakao.com', path: '/v2/api/talk/memo/default/send', method: 'POST',
        headers: {
            'Authorization': `Bearer ${tokens.access_token}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(body)
        }
    };

    return new Promise((resolve) => {
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', d => data += d);
            res.on('end', () => {
                if (res.statusCode === 200) resolve({ success: true });
                else if (res.statusCode === 401) resolve({ success: false, code: 401 });
                else {
                    console.log(`❌ 전송 실패: ${data}`);
                    resolve({ success: false });
                }
            });
        });
        req.write(body);
        req.end();
    });
}

async function sendMe(text) {
    if (!fs.existsSync(TOKEN_PATH)) throw new Error('토큰 없음');
    let tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));

    // 공고 날짜 가져오기
    let noticeDate = new Date().toISOString().split('T')[0];
    if (fs.existsSync('dates.json')) {
        const dates = JSON.parse(fs.readFileSync('dates.json', 'utf8'));
        noticeDate = dates.d1 || noticeDate;
    }

    const propertyChunks = text.split(/\[분석 대상\]/).filter(p => p.trim().length > 0);

    // 1. 분석 기준 안내 메시지 전송 (첫 회만)
    const introTemplate = {
        object_type: 'text',
        text: `[${noticeDate} 청약 분석 가동]\n\n🤖 분석 필터링 기준 안내:\n1. 거주지: 수원 거주자 우선 순위 확인\n2. 예산: 분양가 7억 미만 (발코니 확장 포함 기준)\n3. 면적: 전용 45㎡ ~ 85㎡\n4. 제외지역: 김포, 구로, 부천 (분석 대상에서 즉시 제외)\n\n위 기준에 따라 엄격히 필터링된 결과만 전송해 드립니다.`,
        link: { web_url: 'https://www.applyhome.co.kr' },
        button_title: '청약홈 바로가기'
    };

    if (propertyChunks.length === 0) {
        introTemplate.text = `[${noticeDate} 분석 결과]\n\n조회된 신규 공고가 없거나 조건에 부합하는 단지가 없습니다.`;
        await sendRequest(tokens, introTemplate);
        return;
    }

    // 인트로 전송
    await sendRequest(tokens, introTemplate);
    await new Promise(r => setTimeout(r, 1000));

    // 2. 개별 공고 분석 결과 전송
    for (let i = 0; i < propertyChunks.length; i++) {
        const chunk = propertyChunks[i].trim();
        const lines = chunk.split('\n');
        const propertyName = lines[0].trim();
        
        const filteredLines = lines.slice(1).filter(line => {
            const l = line.trim();
            if (!l) return false;
            const low = l.toLowerCase();
            if (low.includes('i will') || low.includes("i'll") || low.includes('i am') || 
                low.includes('extracting') || low.includes('analyzing') || low.includes('searching') ||
                l.includes('분석을 시작') || l.includes('텍스트를 추출') || l.includes('확인하겠습니다') || 
                l.includes('검색하겠습니다') || l.includes('파악하겠습니다') || l.includes('판단하겠습니다') || 
                l.includes('작성합니다') || l.includes('도와주세요')) return false;
            return true;
        });

        const urlMatch = chunk.match(/🔗공고문링크:\s*([^\s\n]+)/);
        const targetUrl = (urlMatch && urlMatch[1].trim()) || 'https://www.applyhome.co.kr';
        const contentBody = filteredLines.join('\n').replace(/🔗공고문링크:.*\n?/g, '').trim();

        const template = {
            object_type: 'text',
            text: `[${noticeDate} 공고 #${i + 1}]\n🏠 ${propertyName}\n\n${contentBody}\n\n📄 [공고문 PDF]\n${targetUrl}`,
            link: { web_url: targetUrl, mobile_web_url: targetUrl },
            button_title: '공고문 PDF 보기'
        };

        let result = await sendRequest(tokens, template);
        if (!result.success && result.code === 401) {
            tokens = await refreshToken();
            await sendRequest(tokens, template);
        }
        await new Promise(r => setTimeout(r, 1000));
    }
    return true;
}

const mode = process.argv[2];
const arg = process.argv[3];
if (mode === 'send' && arg) {
    sendMe(arg).then(() => console.log('✅ 전송 완료')).catch(console.error);
}
