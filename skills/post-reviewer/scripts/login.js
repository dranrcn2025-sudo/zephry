require('dotenv').config();
const fs = require('fs');
const path = require('path');

const BASIC_AUTH_HEADER = process.env.OUTER_BASIC_AUTH || ('Basic ' + Buffer.from(((process.env.OUTER_USER||'') + ':' + (process.env.OUTER_PASS||''))).toString('base64'));

const CONFIG = {
    loginURL: process.env.ADMIN_URL+'/login/do',
    username: process.env.LOGIN_USER,
    password: process.env.LOGIN_PASS,
    googleTotpSecret: process.env.GOOGLE_TOTP_SECRET || '',
    tokenTTL: parseInt(process.env.TOKEN_TTL || '3600') * 1000,
    tokenCacheFile: path.join(__dirname, '.token_cache.json'),
};

function base32Decode(input) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';
    input.replace(/=+$/,'').toUpperCase().split('').forEach(ch => {
        const idx = alphabet.indexOf(ch);
        if (idx < 0) throw new Error('invalid base32 secret');
        bits += idx.toString(2).padStart(5, '0');
    });
    const bytes = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) {
        bytes.push(parseInt(bits.slice(i, i + 8), 2));
    }
    return Buffer.from(bytes);
}

function generateTotp(secret) {
    const crypto = require('crypto');
    const key = base32Decode(secret);
    const counter = Math.floor(Date.now() / 1000 / 30);
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64BE(BigInt(counter));
    const hmac = crypto.createHmac('sha1', key).update(buf).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const code = ((hmac.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, '0');
    return code;
}

function loadTokenCache() {
    try {
        const raw = fs.readFileSync(CONFIG.tokenCacheFile, 'utf8');
        const cache = JSON.parse(raw);
        if (cache && cache.token && cache.uid && cache.phpsessid && cache.expiresAt) {
            if (Date.now() < cache.expiresAt) {
                return { token: cache.token, uid: cache.uid, phpsessid: cache.phpsessid };
            }
        }
    } catch (_) {
        // 缓存不存在或损坏，忽略
    }
    return null;
}

function saveTokenCache({ token, uid, phpsessid }) {
    try {
        const cache = { token, uid, phpsessid, expiresAt: Date.now() + CONFIG.tokenTTL };
        fs.writeFileSync(CONFIG.tokenCacheFile, JSON.stringify(cache), 'utf8');
    } catch (err) {
        console.warn('Failed to save token cache:', err.message);
    }
}

// 判断是否已登录：未登录返回 { success: false }
async function login(googleCode = '') {
    const cached = loadTokenCache();
    if (cached) {
        console.log('Using cached token, uid:', cached.uid);
        return { success: true, ...cached, needFreshCode: false };
    }

    if (!googleCode && CONFIG.googleTotpSecret) {
        googleCode = generateTotp(CONFIG.googleTotpSecret);
    }

    // 未登录
    if (!googleCode) {
        return { success: false, message: 'not logged in, please provide google_code' };
    }

    if (!CONFIG.username || !CONFIG.password) {
        return { success: false, message: 'missing username or password in config' };
    }

    const form = new URLSearchParams();
    form.append('username', CONFIG.username);
    form.append('password', CONFIG.password);
    form.append('google_code', googleCode);

    const res = await fetch(CONFIG.loginURL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'Authorization': BASIC_AUTH_HEADER,
        },
        body: form.toString(),
    });

    const data = await res.json();

    const setCookie = res.headers.get('set-cookie') || '';
    const match = setCookie.match(/PHPSESSID=([^;]+)/);
    const phpsessid = match ? match[1] : '';

    if (!data?.data?.token || !phpsessid) {
        return { success: false, message: 'login failed or missing PHPSESSID' };
    }

    const result = {
        token: data.data.token,
        uid: data.data.user_id,
        phpsessid,
    };

    saveTokenCache(result);
    return { success: true, ...result, needFreshCode: true };
}

module.exports = { login, loadTokenCache, saveTokenCache };

// CLI 入口：node login.js --google_code=123456
if (require.main === module) {
    const args = process.argv.slice(2);
    const params = {};
    args.forEach(arg => {
        const [key, value] = arg.replace('--', '').split('=');
        params[key] = value;
    });

    login(params.google_code)
        .then(res => console.log(JSON.stringify(res, null, 2)))
        .catch(err => console.error(err));
}
