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
            res.on('data', (chunk) => data += chunk);
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
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

async function sendMe(text, fallbackUrl = 'https://github.com/HYEONGCHANCHO/SUBSCRIPTION-ANALYSIS') {
    if (!fs.existsSync(TOKEN_PATH)) throw new Error('토큰 없음');
    let tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));

    // 단지별('[분석 대상]')로 메시지 분할
    const properties = text.split('[분석 대상]').filter(p => p.trim().length > 0);

    const sendRequest = (chunk, isFirst) => {
        return new Promise((resolve, reject) => {
            const fullContent = '[분석 대상]' + chunk;
            
            // 1. URL 추출
            const urlMatch = fullContent.match(/🔗LINK:([^\s\n]+)/);
            let targetUrl = (urlMatch && urlMatch[1].trim()) || fallbackUrl;
            
            // 2. 본문 클리닝 (본문에서 긴 URL을 제거하고 깔끔한 텍스트만 남김)
            let cleanText = fullContent
                .replace(/🔗LINK:.*(\n|$)/g, '')
                .replace(/http[s]?:\/\/[^\s\)]+/g, '')
                .trim();
            
            // 제목 추출 (단지명)
            const titleMatch = cleanText.match(/\[분석 대상\]\s*(.*)/);
            const title = (titleMatch && titleMatch[1]) || '청약 분석 리포트';
            const description = cleanText.replace(/\[분석 대상\].*\n?/, '').trim();

            if (!cleanText) return resolve({ success: true });

            // 3. '피드' 템플릿 구성 (제목 클릭 시 이동 + 하단 버튼)
            const template = {
                object_type: 'feed',
                content: {
                    title: title,
                    description: description,
                    image_url: '', // 이미지 없어도 작동하도록 구성
                    link: { web_url: targetUrl, mobile_web_url: targetUrl }
                },
                buttons: [
                    {
                        title: 'PDF 공고문 다운로드',
                        link: { web_url: targetUrl, mobile_web_url: targetUrl }
                    }
                ]
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
                    else {
                        console.log(`❌ Kakao API Error: [${res.statusCode}] ${data}`);
                        // 피드 템플릿 실패 시 텍스트 템플릿으로 폴백
                        sendTextFallback(tokens.access_token, (isFirst ? '📢 리포트\n\n' : '') + cleanText, targetUrl).then(resolve);
                    }
                });
            });
            req.write(body);
            req.end();
        });
    };

    function sendTextFallback(token, text, url) {
        return new Promise((resolve) => {
            const template = {
                object_type: 'text',
                text: text + '\n\n🔗 [PDF 다운로드]\n' + url.substring(0, 50) + '...', // 긴 URL 생략
                link: { web_url: url, mobile_web_url: url },
                button_title: '공고문 보기'
            };
            const body = `template_object=${encodeURIComponent(JSON.stringify(template))}`;
            const options = {
                hostname: 'kapi.kakao.com', path: '/v2/api/talk/memo/default/send', method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) }
            };
            const req = https.request(options, (res) => {
                res.on('data', () => {});
                res.on('end', () => resolve({ success: res.statusCode === 200 }));
            });
            req.write(body);
            req.end();
        });
    }

    for (let i = 0; i < properties.length; i++) {
        let result = await sendRequest(properties[i], i === 0);
        if (!result.success && result.code === 401) {
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
