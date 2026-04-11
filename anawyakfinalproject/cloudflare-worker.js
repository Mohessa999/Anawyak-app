/**
 * ═══════════════════════════════════════════════════════════
 *  ANA WYAK — Cloudflare Worker v2  (Anthropic API Proxy)
 *  Deploy at: https://dash.cloudflare.com → Workers & Pages
 *
 *  SETUP (one-time):
 *  1. Go to Cloudflare Dashboard → Workers & Pages → anawyak worker
 *  2. Click "Settings" → "Variables and Secrets"
 *  3. Click "+ Add" under "Secrets"  ← must be SECRET not Plaintext
 *  4. Name:  ANTHROPIC_API_KEY
 *     Value: sk-ant-api03-XXXXXXXX  (your key from console.anthropic.com)
 *  5. Click "Encrypt" then "Save"
 *  6. Go back to the worker → "Edit Code"
 *     → Replace ALL code with this file → Deploy
 *  7. Done! All users get AI automatically. Key stays server-side.
 *
 *  VERIFY: Visit https://anawyak.moh-essa.workers.dev in browser
 *    → Should show: {"error":{"message":"Send a POST request"}}
 *    → That means the worker is live and working ✅
 * ═══════════════════════════════════════════════════════════
 */

// ── Allowed origins ─────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'https://anawyak-ai.pages.dev',
  'https://anawyak.com',
  'https://www.anawyak.com',
  'https://anwyak.com',
  'http://localhost:3000',
  'http://127.0.0.1:5500',
  'http://localhost:5500',
];

// ── CORS headers ─────────────────────────────────────────────
function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResp(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

// ── Main handler ──────────────────────────────────────────────
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // Only POST
    if (request.method !== 'POST') {
      return jsonResp({ error: { message: 'Send a POST request' } }, 400, origin);
    }

    // Check key is set
    if (!env.ANTHROPIC_API_KEY) {
      return jsonResp({
        error: {
          message: '⚙️ Worker not configured: go to Worker Settings → Variables and Secrets → Add Secret → ANTHROPIC_API_KEY'
        }
      }, 500, origin);
    }

    // Parse body
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResp({ error: { message: 'Invalid JSON body' } }, 400, origin);
    }

    // Safety: validate messages array
    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (messages.length === 0) {
      return jsonResp({ error: { message: 'No messages provided' } }, 400, origin);
    }

    // Forward to Anthropic
    let anthropicRes;
    try {
      anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model:      body.model      || 'claude-sonnet-4-5',
          max_tokens: body.max_tokens || 600,
          system:     body.system     || '',
          messages,
        }),
      });
    } catch (err) {
      return jsonResp({ error: { message: 'Failed to reach Anthropic: ' + err.message } }, 502, origin);
    }

    const data = await anthropicRes.json();

    return new Response(JSON.stringify(data), {
      status: anthropicRes.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  },
};