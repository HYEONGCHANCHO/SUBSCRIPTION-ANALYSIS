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

async function sendMe(text) {
    if (!fs.existsSync(TOKEN_PATH)) throw new Error('토큰 없음');
    let tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));

    // 단지별로 리포트 분할
    const properties = text.split('[분석 대상]').filter(p => p.trim().length > 0);

    const sendRequest = (chunk, isFirst) => {
        return new Promise((resolve, reject) => {
            const fullContent = '[분석 대상]' + chunk;
            const urlMatch = fullContent.match(/🔗공고문링크:\s*([^\s\n]+)/);
            const targetUrl = (urlMatch && urlMatch[1].trim()) || 'https://www.applyhome.co.kr';
            
            const cleanText = fullContent.replace(/🔗공고문링크:.*\n?/g, '').trim();

            const template = {
                object_type: 'text',
                text: (isFirst ? '📢 [최종 청약 타당성 보고서]\n\n' : '') + cleanText + `\n\n📄 [공고문 PDF]\n${targetUrl}`,
                link: { web_url: targetUrl, mobile_web_url: targetUrl },
                button_title: 'PDF 공고문 열기'
            };

            const body = `template_object=${encodeURIComponent(JSON.stringify(template))}`;

            const options = {
                hostname: 'kapi.kakao.com', path: '/v2/api/talk/memo/default/send', method: 'POST',
                headers: {
                    'Authorization': `Bearer ${tokens.access_token}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': Buffer.byteLength(body)
                }
            };

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
    };

    for (let i = 0; i < properties.length; i++) {
        let result = await sendRequest(properties[i], i === 0);
        if (!result.success && result.code === 401) {
            console.log("🔄 토큰 갱신 및 재시도...");
            tokens = await refreshToken();
            result = await sendRequest(properties[i], i === 0);
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
