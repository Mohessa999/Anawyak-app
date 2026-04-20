/**
 * Ana Wyak — Cloudflare Worker v3.0
 * Routes:
 *   POST /             → Anthropic AI proxy
 *   POST /send-email   → Resend verification / transactional email
 *   POST /store-lead   → Supabase marketing lead capture
 *   POST /sync         → Save couple sync data to KV
 *   GET  /partner/:code → Fetch partner's sync data from KV
 *   POST /paddle-webhook → Paddle payment webhook → activate Pro
 *
 * Required Cloudflare Worker Secrets (Settings → Variables → Secrets):
 *   ANTHROPIC_API_KEY   — from console.anthropic.com
 *   RESEND_API_KEY      — from resend.com (free: 100 emails/day)
 *   SUPABASE_URL        — from supabase.com project settings (optional)
 *   SUPABASE_ANON_KEY   — from supabase.com project settings (optional)
 *   PADDLE_WEBHOOK_SECRET — from Paddle Dashboard → Notifications → Webhook secret
 *
 * Required KV Namespace Binding (Settings → Variables → KV Namespace Bindings):
 *   SYNC_STORE → Create a KV namespace called "AnaWyak_Sync" and bind it as SYNC_STORE
 */

const ALLOWED_ORIGINS = [
  'https://anawyak.app',
  'https://www.anawyak.app',
  'https://ibrahimabboud14.github.io',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1',
];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.some(o => origin === o || origin.endsWith('.github.io'))
    ? origin
    : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '') || '/';

    // Allow GET only for partner sync endpoint
    if (request.method === 'GET') {
      const partnerMatch = path.match(/^\/partner\/(.+)$/i);
      if (partnerMatch) {
        // Decode URI component to handle keys like "ABC123:game:couples"
        const code = decodeURIComponent(partnerMatch[1]).toUpperCase();
        return handleGetPartner(code, env, origin);
      }
      return json({ error: 'Not found' }, 404, origin);
    }

    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405, origin);
    }

    try {
      if (path === '/' || path === '')   return handleAI(request, env, origin);
      if (path === '/send-email')        return handleSendEmail(request, env, origin);
      if (path === '/store-lead')        return handleStoreLead(request, env, origin);
      if (path === '/sync')              return handleSync(request, env, origin);
      if (path === '/paddle-webhook')    return handlePaddleWebhook(request, env, origin);
      if (path === '/request-code')      return handleRequestCode(request, env, origin);
      if (path === '/verify-code')       return handleVerifyCode(request, env, origin);
      return json({ error: 'Not found' }, 404, origin);
    } catch (err) {
      console.error('[AW Worker]', err);
      return json({ error: err.message || 'Internal error' }, 500, origin);
    }
  },
};

// ═══════════════════════════════════════════
//  AI PROXY — forwards to Anthropic
// ═══════════════════════════════════════════
async function handleAI(request, env, origin) {
  if (!env.ANTHROPIC_API_KEY) {
    return json({ error: 'ANTHROPIC_API_KEY not set in Worker secrets' }, 500, origin);
  }
  const body = await request.text();
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body,
  });
  const data = await r.text();
  return new Response(data, {
    status: r.status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

// ═══════════════════════════════════════════
//  EMAIL — send verification codes via Resend
// ═══════════════════════════════════════════
async function handleSendEmail(request, env, origin) {
  const { email, code, name, type } = await request.json();
  if (!email || !code) return json({ error: 'Missing email or code' }, 400, origin);

  if (!env.RESEND_API_KEY) {
    return json({ ok: false, reason: 'resend_not_configured' }, 200, origin);
  }

  const isArabic = /[\u0600-\u06FF]/.test(name || '');
  const displayName = name || (isArabic ? 'الحبيب' : 'there');

  const subject = isArabic
    ? 'رمز التحقق من أنا وياك 💕'
    : 'Ana Wyak — Your Verification Code 💕';

  const dir = isArabic ? 'rtl' : 'ltr';
  const greeting  = isArabic ? `مرحباً ${displayName} 💕` : `Welcome, ${displayName} 💕`;
  const intro     = isArabic
    ? 'هذا رمز التحقق لحسابك في <strong>أنا وياك</strong>:'
    : 'Here is your verification code for <strong>Ana Wyak</strong>:';
  const footnote  = isArabic
    ? 'هذا الرمز صالح لجلسة التسجيل الحالية. لا تشاركه مع أحد.'
    : 'This code is valid for your current registration session. Never share it.';
  const footer    = isArabic
    ? 'إذا لم تطلب هذا الرمز، تجاهل هذا البريد.'
    : "If you didn't request this, ignore this email.";

  const html = `<!DOCTYPE html>
<html lang="${isArabic ? 'ar' : 'en'}" dir="${dir}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#150D10;font-family:${isArabic ? "'Cairo'," : ''} 'Nunito',sans-serif;color:#F5E6EB">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding:40px 20px">
<table width="480" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,.06);border-radius:24px;border:1px solid rgba(240,204,112,.2);overflow:hidden">
  <tr><td style="background:linear-gradient(135deg,#1a0e12,#150D10);padding:32px 32px 24px;text-align:center">
    <div style="font-family:Georgia,serif;font-size:42px;color:#E8849A;font-weight:700;line-height:1">أنا وياك</div>
    <div style="font-family:Georgia,serif;font-size:14px;color:#C9954A;letter-spacing:4px;margin-top:4px">ANA WYAK</div>
  </td></tr>
  <tr><td style="padding:28px 32px">
    <h2 style="margin:0 0 12px;color:#F5E6EB;font-size:20px;font-weight:700">${greeting}</h2>
    <p style="margin:0 0 20px;color:#C4A0AF;line-height:1.7;font-size:15px">${intro}</p>
    <div style="background:rgba(240,204,112,.12);border:2px solid #F0CC70;border-radius:16px;padding:24px;text-align:center;margin:0 0 24px">
      <div style="font-family:monospace;font-size:38px;font-weight:700;color:#F0CC70;letter-spacing:10px;word-break:break-all">${code}</div>
    </div>
    <p style="margin:0 0 16px;color:#C4A0AF;font-size:13px;line-height:1.7">${footnote}</p>
    <p style="margin:0;color:#7A5A65;font-size:12px;line-height:1.7">${footer}</p>
  </td></tr>
  <tr><td style="border-top:1px solid rgba(255,255,255,.08);padding:16px 32px;text-align:center">
    <a href="https://anawyak.app" style="color:#E8849A;text-decoration:none;font-size:13px">anawyak.app</a>
    <span style="color:#7A5A65;margin:0 8px">·</span>
    <a href="mailto:support@anawyak.app" style="color:#C4A0AF;text-decoration:none;font-size:13px">support@anawyak.app</a>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const fromEmail = env.RESEND_FROM_EMAIL || 'Ana Wyak <onboarding@resend.dev>';

  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: fromEmail, to: [email], subject, html }),
  });

  const resendData = await resendRes.json().catch(() => ({}));

  if (!resendRes.ok) {
    console.error('[AW] Resend error:', resendData);
    return json({ ok: false, reason: 'resend_api_error', detail: resendData }, 200, origin);
  }

  // Notify owner on new signup
  if (type === 'signup' && env.RESEND_API_KEY) {
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: fromEmail,
        to: ['support@anawyak.app'],
        subject: `New Ana Wyak Registration: ${email}`,
        html: `<p style="font-family:sans-serif">New user registered:<br><br><strong>Email:</strong> ${email}<br><strong>Name:</strong> ${name || 'N/A'}</p>`,
      }),
    }).catch(() => {});
  }

  return json({ ok: true, id: resendData.id }, 200, origin);
}

// ═══════════════════════════════════════════
//  LEAD STORAGE — Supabase marketing table
// ═══════════════════════════════════════════
async function handleStoreLead(request, env, origin) {
  const data = await request.json().catch(() => ({}));

  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return json({ ok: true, stored: false, reason: 'supabase_not_configured' }, 200, origin);
  }

  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/aw_leads`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      email:      data.email      || null,
      name:       data.name       || null,
      partner:    data.partner    || null,
      vibe:       data.vibe       || null,
      wish:       data.wish       || null,
      fam:        data.fam        || null,
      lang:       data.lang       || null,
      region:     data.region     || null,
      source:     data.source     || 'signup',
      created_at: new Date().toISOString(),
    }),
  });

  return json({ ok: r.ok, status: r.status }, 200, origin);
}

// ═══════════════════════════════════════════
//  PARTNER SYNC — KV-backed couple data
// ═══════════════════════════════════════════
async function handleSync(request, env, origin) {
  if (!env.SYNC_STORE) {
    return json({ ok: false, reason: 'kv_not_configured' }, 200, origin);
  }

  const body = await request.json().catch(() => ({}));
  const { code, ...payload } = body;

  if (!code || code.length < 4) {
    return json({ error: 'Missing or invalid code' }, 400, origin);
  }

  // Game session keys already contain colons — preserve casing; plain codes are uppercased
  const normalizedCode = code.includes(':') ? code : code.toUpperCase();
  const key = `sync:${normalizedCode}`;
  const entry = { ...payload, updatedAt: new Date().toISOString() };

  await env.SYNC_STORE.put(key, JSON.stringify(entry), { expirationTtl: 86400 * 30 }); // 30-day TTL

  return json({ ok: true }, 200, origin);
}

async function handleGetPartner(code, env, origin) {
  if (!env.SYNC_STORE) {
    return json({ ok: false, reason: 'kv_not_configured' }, 200, origin);
  }

  const normalizedCode = code.includes(':') ? code : code.toUpperCase();
  const key = `sync:${normalizedCode}`;
  const raw = await env.SYNC_STORE.get(key);

  if (!raw) return json({ ok: false, reason: 'not_found' }, 200, origin);

  const data = JSON.parse(raw);
  return json({ ok: true, data }, 200, origin);
}

// ═══════════════════════════════════════════
//  PADDLE WEBHOOK — activate Pro on payment
// ═══════════════════════════════════════════
async function handlePaddleWebhook(request, env, origin) {
  const body = await request.text();

  // Verify Paddle signature if secret is set
  if (env.PADDLE_WEBHOOK_SECRET) {
    const sig = request.headers.get('Paddle-Signature') || '';
    const ts  = sig.match(/ts=(\d+)/)?.[1];
    const h1  = sig.match(/h1=([a-f0-9]+)/)?.[1];
    if (!ts || !h1) return json({ error: 'Invalid signature header' }, 401, origin);

    const signed = `${ts}:${body}`;
    const keyBytes = new TextEncoder().encode(env.PADDLE_WEBHOOK_SECRET);
    const msgBytes = new TextEncoder().encode(signed);
    const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sigBytes = await crypto.subtle.sign('HMAC', key, msgBytes);
    const computed = Array.from(new Uint8Array(sigBytes)).map(b => b.toString(16).padStart(2, '0')).join('');
    if (computed !== h1) return json({ error: 'Signature mismatch' }, 401, origin);
  }

  const event = JSON.parse(body);
  const eventType = event?.event_type || '';

  // On successful subscription, store Pro status keyed by customer email
  if (eventType === 'subscription.activated' || eventType === 'transaction.completed') {
    const email = event?.data?.customer?.email || event?.data?.billing_details?.email || '';
    if (email && env.SYNC_STORE) {
      await env.SYNC_STORE.put(`pro:${email.toLowerCase()}`, '1', { expirationTtl: 86400 * 400 });
    }
  }

  return json({ received: true }, 200, origin);
}

// ═══════════════════════════════════════════
//  SERVER-SIDE EMAIL VERIFICATION
//  Code generated + stored in KV (not client) — DevTools-proof
//  Rate limit: 3 requests / email / 24h
//  Code expires: 10 minutes
//  Max attempts: 5 per code
// ═══════════════════════════════════════════
function genVerifyCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

async function handleRequestCode(request, env, origin) {
  const { email, name, type } = await request.json().catch(() => ({}));
  if (!email || !email.includes('@')) return json({ ok: false, error: 'invalid_email' }, 400, origin);

  const emailKey = email.toLowerCase().trim();

  // Rate limit check: max 3 code requests per email per 24h
  if (env.SYNC_STORE) {
    const rlKey = `rl:${emailKey}`;
    const rlRaw = await env.SYNC_STORE.get(rlKey);
    const rl = rlRaw ? JSON.parse(rlRaw) : { count: 0, ts: 0 };
    const now = Date.now();
    const windowMs = 86400 * 1000; // 24 hours
    if (now - rl.ts < windowMs && rl.count >= 3) {
      return json({ ok: false, error: 'rate_limited', retryAfterMs: windowMs - (now - rl.ts) }, 200, origin);
    }
    const newCount = (now - rl.ts < windowMs) ? rl.count + 1 : 1;
    await env.SYNC_STORE.put(rlKey, JSON.stringify({ count: newCount, ts: now }), { expirationTtl: 86400 });
  }

  // Generate code + store in KV with 10-minute TTL
  const code = genVerifyCode();
  const codeEntry = { code, ts: Date.now(), attempts: 0, name: name || '' };

  if (env.SYNC_STORE) {
    await env.SYNC_STORE.put(`vc:${emailKey}`, JSON.stringify(codeEntry), { expirationTtl: 600 }); // 10 min
  }

  // Send email via Resend
  if (!env.RESEND_API_KEY) {
    // Resend not configured — return code to show on-screen
    return json({ ok: true, fallback: true, code }, 200, origin);
  }

  const isArabic = /[\u0600-\u06FF]/.test(name || '');
  const displayName = name || (isArabic ? 'الحبيب' : 'there');
  const subject = isArabic ? 'رمز التحقق من أنا وياك 💕' : 'Ana Wyak — Your Verification Code 💕';
  const dir = isArabic ? 'rtl' : 'ltr';
  const greeting = isArabic ? `مرحباً ${displayName} 💕` : `Welcome, ${displayName} 💕`;
  const intro = isArabic
    ? 'هذا رمز التحقق لحسابك في <strong>أنا وياك</strong>. صالح لـ 10 دقائق فقط:'
    : 'Here is your <strong>Ana Wyak</strong> verification code. Valid for 10 minutes only:';
  const footnote = isArabic
    ? 'هذا الرمز صالح لمرة واحدة لمدة 10 دقائق. لا تشاركه مع أحد.'
    : 'This one-time code expires in 10 minutes. Never share it with anyone.';

  const html = `<!DOCTYPE html><html lang="${isArabic?'ar':'en'}" dir="${dir}"><head><meta charset="UTF-8"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#150D10;font-family:'Nunito',sans-serif;color:#F5E6EB">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px">
<table width="480" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,.06);border-radius:24px;border:1px solid rgba(240,204,112,.2);overflow:hidden">
<tr><td style="background:linear-gradient(135deg,#1a0e12,#150D10);padding:32px 32px 24px;text-align:center">
<div style="font-family:Georgia,serif;font-size:42px;color:#E8849A;font-weight:700">أنا وياك</div>
<div style="font-family:Georgia,serif;font-size:14px;color:#C9954A;letter-spacing:4px;margin-top:4px">ANA WYAK</div>
</td></tr>
<tr><td style="padding:28px 32px">
<h2 style="margin:0 0 12px;color:#F5E6EB;font-size:20px;font-weight:700">${greeting}</h2>
<p style="margin:0 0 20px;color:#C4A0AF;line-height:1.7;font-size:15px">${intro}</p>
<div style="background:rgba(240,204,112,.12);border:2px solid #F0CC70;border-radius:16px;padding:24px;text-align:center;margin:0 0 24px">
<div style="font-family:monospace;font-size:38px;font-weight:700;color:#F0CC70;letter-spacing:10px">${code}</div>
</div>
<p style="margin:0 0 16px;color:#C4A0AF;font-size:13px;line-height:1.7">${footnote}</p>
</td></tr>
<tr><td style="border-top:1px solid rgba(255,255,255,.08);padding:16px 32px;text-align:center">
<a href="https://anawyak.app" style="color:#E8849A;text-decoration:none;font-size:13px">anawyak.app</a>
<span style="color:#7A5A65;margin:0 8px">·</span>
<a href="mailto:support@anawyak.app" style="color:#C4A0AF;text-decoration:none;font-size:13px">support@anawyak.app</a>
</td></tr></table></td></tr></table>
</body></html>`;

  const fromEmail = env.RESEND_FROM_EMAIL || 'Ana Wyak <onboarding@resend.dev>';
  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: fromEmail, to: [emailKey], subject, html }),
  });

  if (!resendRes.ok) {
    await resendRes.json().catch(() => {});
    // Email failed — return code as fallback
    return json({ ok: true, fallback: true, code }, 200, origin);
  }

  // Notify owner on new signup
  if (type === 'signup') {
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: fromEmail, to: ['support@anawyak.app'],
        subject: `New Ana Wyak Signup: ${emailKey}`,
        html: `<p style="font-family:sans-serif">New user:<br><strong>Email:</strong> ${emailKey}<br><strong>Name:</strong> ${name||'N/A'}</p>`,
      }),
    }).catch(() => {});
  }

  return json({ ok: true, fallback: false }, 200, origin);
}

async function handleVerifyCode(request, env, origin) {
  const { email, code } = await request.json().catch(() => ({}));
  if (!email || !code) return json({ ok: false, error: 'missing_fields' }, 400, origin);

  const emailKey = email.toLowerCase().trim();

  if (!env.SYNC_STORE) {
    // KV not configured — accept any 6-char code (development fallback)
    return json({ ok: true, verified: true }, 200, origin);
  }

  const vcKey = `vc:${emailKey}`;
  const raw = await env.SYNC_STORE.get(vcKey);
  if (!raw) return json({ ok: false, error: 'expired' }, 200, origin);

  const entry = JSON.parse(raw);

  // Max 5 attempts per code
  if (entry.attempts >= 5) {
    await env.SYNC_STORE.delete(vcKey);
    return json({ ok: false, error: 'too_many_attempts' }, 200, origin);
  }

  if (entry.code !== code.toUpperCase().trim()) {
    entry.attempts++;
    await env.SYNC_STORE.put(vcKey, JSON.stringify(entry), { expirationTtl: 600 });
    return json({ ok: false, error: 'wrong_code', attemptsLeft: 5 - entry.attempts }, 200, origin);
  }

  // Code correct — delete it (one-time use) and mark email as verified
  await env.SYNC_STORE.delete(vcKey);
  await env.SYNC_STORE.put(`verified:${emailKey}`, '1', { expirationTtl: 86400 * 365 });

  return json({ ok: true, verified: true }, 200, origin);
}
