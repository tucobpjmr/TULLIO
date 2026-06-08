// Vercel serverless function (Node.js runtime).
// Proxy verso Anthropic Messages API: tiene la ANTHROPIC_API_KEY lato server,
// così non viene esposta al client.
//
// Env richieste:
//   - ANTHROPIC_API_KEY    (obbligatoria)
//   - ANTHROPIC_MODEL      (opzionale, default sotto)

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const ANTHROPIC_VERSION = '2023-06-01';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY non configurata sul server' });
  }

  const { prompt, maxTokens } = req.body || {};
  if (typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'Body deve contenere { prompt: string }' });
  }

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
        max_tokens: typeof maxTokens === 'number' ? maxTokens : 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const msg = data?.error?.message || `Anthropic API ${upstream.status}`;
      return res.status(upstream.status).json({ error: msg });
    }
    return res.status(200).json(data);
  } catch (e) {
    return res.status(502).json({ error: e?.message || 'Errore di rete verso Anthropic' });
  }
}
