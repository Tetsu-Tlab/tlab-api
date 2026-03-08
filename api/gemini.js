/**
 * ANTIGRAVITY Gemini API Proxy
 * POST /api/gemini  → Gemini API にリクエストを転送
 * GET  /api/gemini/models → 利用可能なモデル一覧を返す
 *
 * 環境変数:
 *   GEMINI_API_KEY  - Google AI Studio で発行したAPIキー
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
};

export default async function handler(req, res) {
    Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));

    if (req.method === 'OPTIONS') return res.status(200).end();

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
        const { model, contents, systemInstruction } = req.body || {};
        if (!model || !contents) {
            return res.status(400).json({ error: 'model と contents は必須です' });
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
            return res.status(500).json({ error: err.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
