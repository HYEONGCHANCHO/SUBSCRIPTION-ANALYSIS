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

    const properties = text.split('[분석 대상]').filter(p => p.trim().length > 0);

    const sendRequest = (chunk, isFirst) => {
        return new Promise((resolve, reject) => {
            const fullContent = '[분석 대상]' + chunk;
            
            // 1. URL 추출 정규식 보완 (🔗LINK: 마커 뒤에 오는 모든 문자열 추출 후 정리)
            const urlMatch = fullContent.match(/🔗LINK:([^\s]+)/);
            let targetUrl = fallbackUrl;
            if (urlMatch && urlMatch[1]) {
                targetUrl = urlMatch[1].trim();
            }
            
            console.log(`[Kakao] Target URL for chunk: ${targetUrl.substring(0, 70)}...`);

            // 2. 텍스트 클리닝 (🔗LINK 전체 줄 및 기타 URL 제거)
            let cleanText = fullContent
                .replace(/🔗LINK:[^\n]*\n?/g, '')
                .replace(/http[s]?:\/\/[^\s\)]+/g, '')
                .trim();

            if (!cleanText) return resolve({ success: true });

            // 3. 템플릿 구성 (버튼이 누락되지 않도록 명확하게)
            const template = {
                object_type: 'text',
                text: (isFirst ? '📢 청약 통합 정밀 분석 리포트\n\n' : '') + cleanText,
                link: { 
                    web_url: targetUrl, 
                    mobile_web_url: targetUrl 
                },
                buttons: [
                    {
                        title: '공고문 PDF 다운로드',
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
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        resolve({ success: true });
                    } else if (res.statusCode === 401) {
                        resolve({ success: false, code: 401 });
                    } else {
                        console.log(`❌ Kakao API Error: [${res.statusCode}] ${data}`);
                        resolve({ success: false });
                    }
                });
            });
            req.on('error', (e) => {
                console.log(`❌ Request Error: ${e.message}`);
                resolve({ success: false });
            });
            req.write(body);
            req.end();
        });
    };

    for (let i = 0; i < properties.length; i++) {
        let result = await sendRequest(properties[i], i === 0);
        if (!result.success && result.code === 401) {
            console.log("🔄 토큰 갱신 중...");
            tokens = await refreshToken();
            result = await sendRequest(properties[i], i === 0);
        }
        await new Promise(r => setTimeout(r, 1000));
    }
    return true;
}

const mode = process.argv[2];
const arg = process.argv[3];
const urlArg = process.argv[4];

if (mode === 'send' && arg) {
    sendMe(arg, urlArg).then(() => console.log('✅ 전송 완료')).catch(console.error);
}
