/**
 * ANTIGRAVITY Gemini API Proxy
 * POST /api/gemini  → Gemini API にリクエストを転送
 * GET  /api/gemini/models → 利用可能なモデル一覧を返す
 *
 * 環境変数:
 *   GEMINI_API_KEY  - Google AI Studio で発行したAPIキー
 */

import { guard, bodySize } from './_guard.js';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// モデル名はURLに埋め込むため、形を厳しく確かめる（別のAPIへ飛ばされないように）
const MODEL_RE = /^gemini-[0-9a-z.-]{1,60}$/;
const MAX_BODY_BYTES = 4 * 1024 * 1024; // 本文は4MBまで（PDF・画像の添付を考慮）

export default async function handler(req, res) {
    // 許可したオリジン・回数制限（所見A）。CORS は guard が付ける
    if (!guard(req, res, { name: 'gemini', limit: 20 })) return;

    if (!GEMINI_API_KEY) {
        return res.status(500).json({ error: 'GEMINI_API_KEY が設定されていません' });
    }

    // ── GET: 利用可能なモデル一覧を返す ──────────────────────
    if (req.method === 'GET') {
        try {
            const r = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`
            );
            const data = await r.json();
            if (data.error) return res.status(400).json({ error: data.error.message });

            // generateContent に対応したGeminiモデルのみ返す
            const models = (data.models || [])
                .filter(m =>
                    m.name.includes('gemini') &&
                    m.supportedGenerationMethods?.includes('generateContent') &&
                    !m.name.includes('embedding') &&
                    !m.name.includes('aqa')
                )
                .map(m => ({
                    name: m.name.replace('models/', ''),
                    displayName: m.displayName || m.name,
                }));

            return res.status(200).json({ models });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    // ── POST: Gemini API にリクエストを転送 ──────────────────
    if (req.method === 'POST') {
        if (bodySize(req.body) > MAX_BODY_BYTES) {
            return res.status(413).json({ error: 'リクエストが大きすぎます' });
        }
        const { model, contents, systemInstruction } = req.body || {};
        if (!model || !contents) {
            return res.status(400).json({ error: 'model と contents は必須です' });
        }
        if (typeof model !== 'string' || !MODEL_RE.test(model)) {
            return res.status(400).json({ error: 'model の指定が正しくありません' });
        }
        if (!Array.isArray(contents)) {
            return res.status(400).json({ error: 'contents は配列で指定してください' });
        }

        try {
            const body = { contents };
            if (systemInstruction) body.systemInstruction = systemInstruction;

            const r = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                }
            );
            const data = await r.json();
            if (data.error) return res.status(400).json({ error: data.error.message });
            return res.status(200).json(data);
        } catch (err) {
            return res.status(500).json({ error: 'Gemini への中継に失敗しました' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
