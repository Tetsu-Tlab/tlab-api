/**
 * tlab-api 共通の入口チェック（セキュリティ点検 2026-11-07 所見A）
 *
 * - 許可したオリジン（自分のアプリ）からの呼び出しだけを通す
 * - 環境変数 TLAB_API_TOKEN を設定した場合は、x-tlab-token ヘッダーも必須にする
 * - インスタンス単位の簡易な回数制限
 *
 * 環境変数（Vercel の Project Settings → Environment Variables）:
 *   ALLOWED_ORIGINS  カンマ区切り。未設定なら下の DEFAULT_ORIGINS を使う
 *   TLAB_API_TOKEN   任意。設定すると x-tlab-token ヘッダーが必須になる
 *
 * ファイル名が _ で始まるため、Vercel はこのファイルを API として公開しない。
 */

const DEFAULT_ORIGINS = [
    'https://shidouan.vercel.app',
    'https://unit-plan.vercel.app',
    'https://shinchoku-kanri.vercel.app',
    'https://novalab-for-educator.vercel.app',
    'https://gakkyuu-tuushin.vercel.app',
    'http://localhost:5173',
    'http://localhost:3000',
];

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
    .split(',').map(s => s.trim()).filter(Boolean);
const ORIGINS = ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : DEFAULT_ORIGINS;
const TOKEN = process.env.TLAB_API_TOKEN || '';

const hits = new Map();

function clientIp(req) {
    const xf = req.headers['x-forwarded-for'];
    return (Array.isArray(xf) ? xf[0] : (xf || '')).split(',')[0].trim() || 'unknown';
}

function rateLimited(key, limit, windowMs) {
    const now = Date.now();
    const list = (hits.get(key) || []).filter(t => now - t < windowMs);
    if (list.length >= limit) { hits.set(key, list); return true; }
    list.push(now);
    hits.set(key, list);
    if (hits.size > 5000) hits.clear(); // メモリを使いすぎない
    return false;
}

/**
 * @returns {boolean} 続けてよければ true。false のときは応答を返し済み。
 */
export function guard(req, res, { name = 'api', limit = 20, windowMs = 60_000 } = {}) {
    const origin = req.headers.origin || '';
    const allowed = ORIGINS.includes(origin);

    res.setHeader('Vary', 'Origin');
    res.setHeader('Content-Type', 'application/json');
    if (allowed) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-tlab-token');
        res.setHeader('Access-Control-Max-Age', '600');
    }

    if (req.method === 'OPTIONS') {
        res.status(allowed ? 204 : 403).end();
        return false;
    }
    if (!allowed) {
        res.status(403).json({ error: 'forbidden' });
        return false;
    }
    if (TOKEN && req.headers['x-tlab-token'] !== TOKEN) {
        res.status(403).json({ error: 'forbidden' });
        return false;
    }
    if (rateLimited(`${name}:${clientIp(req)}`, limit, windowMs)) {
        res.setHeader('Retry-After', String(Math.ceil(windowMs / 1000)));
        res.status(429).json({ error: 'too many requests' });
        return false;
    }
    return true;
}

/** リクエスト本文のおおよその大きさ（バイト） */
export function bodySize(body) {
    if (body == null) return 0;
    try { return Buffer.byteLength(typeof body === 'string' ? body : JSON.stringify(body)); }
    catch { return Infinity; }
}
