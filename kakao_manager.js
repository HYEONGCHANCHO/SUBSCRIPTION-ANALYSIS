const https = require('https');
const fs = require('fs');
const path = require('path');

const TOKEN_PATH = path.join(__dirname, 'kakao_token.json');
const CLIENT_ID = 'df08177ef1ae98f770df7d05e8239101';
const REDIRECT_URI = 'https://localhost.com';

// 1. 처음 전달받은 CODE로 토큰 세트(Access, Refresh) 발급받기
async function getInitialToken(code) {
    const postData = `grant_type=authorization_code&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&code=${code}`;
    return requestToken(postData);
}

// 2. 리프레시 토큰으로 액세스 토큰 갱신하기
async function refreshToken() {
    if (!fs.existsSync(TOKEN_PATH)) return null;
    const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    const postData = `grant_type=refresh_token&client_id=${CLIENT_ID}&refresh_token=${tokens.refresh_token}`;
    return requestToken(postData);
}

function requestToken(postData) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'kauth.kakao.com',
            path: '/oauth/token',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                const result = JSON.parse(data);
                if (res.statusCode === 200) {
                    // 기존 토큰 정보와 병합 (리프레시 토큰은 안 올 수도 있음)
                    let newTokens = result;
                    if (fs.existsSync(TOKEN_PATH)) {
                        const old = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
                        newTokens = { ...old, ...result };
                    }
                    fs.writeFileSync(TOKEN_PATH, JSON.stringify(newTokens, null, 2));
                    resolve(newTokens);
                } else {
                    reject(data);
                }
            });
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

// 3. 메시지 보내기 (정제된 리포트 전송)
async function sendMe(text) {
    if (!fs.existsSync(TOKEN_PATH)) throw new Error('토큰이 없습니다.');
    let tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));

    // 리포트 텍스트 정제 (너무 길면 카카오 API에서 거부됨)
    // 1. 추천 공고 부분만 추출하거나 앞부분 400자만 사용
    let refinedText = text;
    if (text.includes('✅ *추천 공고*')) {
        refinedText = '📢 오늘자 청약 추천 요약\n' + text.split('✅ *추천 공고*')[1].trim();
    }
    refinedText = refinedText.substring(0, 350) + '\n... (이하 생략)';

    const sendRequest = (token) => {
        return new Promise((resolve, reject) => {
            const body = `template_object=${encodeURIComponent(JSON.stringify({
                object_type: 'text',
                text: refinedText,
                link: { 
                    web_url: 'https://github.com/HYEONGCHANCHO/SUBSCRIPTION-ANALYSIS', 
                    mobile_web_url: 'https://github.com/HYEONGCHANCHO/SUBSCRIPTION-ANALYSIS' 
                },
                button_title: '전체 리포트 확인'
            }))}`;

            const options = {
                hostname: 'kapi.kakao.com',
                path: '/v2/api/talk/memo/default/send',
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': Buffer.byteLength(body)
                }
            };

            const req = https.request(options, (res) => {
                let resData = '';
                res.on('data', d => resData += d);
                res.on('end', () => {
                    if (res.statusCode === 200) resolve({ success: true });
                    else if (res.statusCode === 401) resolve({ success: false, code: 401 });
                    else resolve({ success: false, msg: resData });
                });
            });
            req.write(body);
            req.end();
        });
    };

    let result = await sendRequest(tokens.access_token);
    if (!result.success && result.code === 401) {
        console.log('🔄 액세스 토큰 만료됨. 갱신 시도 중...');
        tokens = await refreshToken();
        result = await sendRequest(tokens.access_token);
    }
    
    if (!result.success) throw new Error('전송 실패: ' + result.msg);
    return true;
}

// 실행 모드 처리
const mode = process.argv[2];
const arg = process.argv[3];

if (mode === 'init' && arg) {
    getInitialToken(arg).then(() => console.log('✅ 최초 토큰 발급 완료')).catch(console.error);
} else if (mode === 'send' && arg) {
    sendMe(arg).then(() => console.log('✅ 메시지 전송 성공')).catch(console.error);
}
