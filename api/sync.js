/**
 * ANTIGRAVITY Shared Data API
 * GET  /api/sync  → 共有データを返す
 * POST /api/sync  → 共有データを更新する
 */

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const EC_ID        = process.env.EDGE_CONFIG_ID;
const TEAM_ID      = process.env.TEAM_ID;
const DATA_KEY     = 'sharedData';

import { guard, bodySize } from './_guard.js';

const MAX_BODY_BYTES = 64 * 1024; // 共有データの更新は64KBまで

export default async function handler(req, res) {
    // 許可したオリジン・回数制限（所見A）。CORS は guard が付ける
    if (!guard(req, res, { name: 'sync', limit: 30 })) return;

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
            return res.status(500).json({ error: '共有データの処理に失敗しました' });
        }
    }

    // ── POST: 共有データを更新 ───────────────────────────────
    if (req.method === 'POST') {
        try {
            if (bodySize(req.body) > MAX_BODY_BYTES) {
                return res.status(413).json({ error: 'データが大きすぎます' });
            }
            const incoming = typeof req.body === 'string'
                ? JSON.parse(req.body) : req.body;
            if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
                return res.status(400).json({ error: 'オブジェクトで送ってください' });
            }

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
            return res.status(500).json({ error: '共有データの処理に失敗しました' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
