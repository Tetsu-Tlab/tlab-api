/**
 * ANTIGRAVITY Shared Data API
 * GET  /api/sync  → 共有データを返す
 * POST /api/sync  → 共有データを更新する
 */

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const EC_ID        = process.env.EDGE_CONFIG_ID;
const TEAM_ID      = process.env.TEAM_ID;
const DATA_KEY     = 'sharedData';

// CORS ヘッダー（全アプリからアクセス可能）
const CORS = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
};

export default async function handler(req, res) {
    // Preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).set(CORS).end();
    }

    Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));

    // ── GET: 共有データを取得 ────────────────────────────────
    if (req.method === 'GET') {
        try {
            const url = `https://api.vercel.com/v1/edge-config/${EC_ID}/item/${DATA_KEY}?teamId=${TEAM_ID}`;
            const r = await fetch(url, {
                headers: { 'Authorization': `Bearer ${VERCEL_TOKEN}` }
            });
            if (r.status === 404) return res.status(200).json({});
            if (!r.ok) throw new Error(`EC read failed: ${r.status}`);
            const raw = await r.json();
            // Edge Config の item レスポンスは { key, value, ... } の形式
            const data = raw?.value ?? raw ?? {};
            return res.status(200).json(data);
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    }

    // ── POST: 共有データを更新 ───────────────────────────────
    if (req.method === 'POST') {
        try {
            const incoming = typeof req.body === 'string'
                ? JSON.parse(req.body) : req.body;

            // 現在値を取得してマージ
            const getUrl = `https://api.vercel.com/v1/edge-config/${EC_ID}/item/${DATA_KEY}?teamId=${TEAM_ID}`;
            const current = await fetch(getUrl, {
                headers: { 'Authorization': `Bearer ${VERCEL_TOKEN}` }
            }).then(r => r.ok ? r.json() : {}).catch(() => ({}));

            const merged = { ...current, ...incoming, updatedAt: new Date().toISOString() };

            // Edge Config に書き込む
            const patchUrl = `https://api.vercel.com/v1/edge-config/${EC_ID}/items?teamId=${TEAM_ID}`;
            const patchRes = await fetch(patchUrl, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${VERCEL_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    items: [{ operation: 'upsert', key: DATA_KEY, value: merged }]
                })
            });

            if (!patchRes.ok) {
                const err = await patchRes.json();
                throw new Error(JSON.stringify(err));
            }

            return res.status(200).json({ ok: true, data: merged });
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
