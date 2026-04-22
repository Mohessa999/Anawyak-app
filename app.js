
// ══════════════════════════════════════════════════
//  CONFIG & STATE
// ══════════════════════════════════════════════════
const CLAUDE_KEY = "";
const API_URL = "https://api.anthropic.com/v1/messages";
// Set your Cloudflare Worker URL here — all users benefit automatically
// Example: const DEFAULT_PROXY = "https://anawyak.moh-essa.workers.dev";
// IMPORTANT: In Worker Settings → add your domain to ALLOWED_ORIGINS array
// e.g. 'https://anawyak.com', 'https://wifaqai.pages.dev'
const DEFAULT_PROXY = "https://anawyak.moh-essa.workers.dev";
const FREE_LIMIT = 5; // Free users get 5/day — enough to feel the magic

// ── ADMIN MODE ────────────────────────────────────────────
// Set this once in browser console: localStorage.setItem('aw_admin','AW2026_FOUNDER')
const ADMIN_TOKEN = 'AW2026_FOUNDER';
function isAdmin(){ return LS.get('aw_admin','') === ADMIN_TOKEN; }

// ── PADDLE BILLING ──────────────────────────────────────────
// Get your client token: Paddle Dashboard → Developer → Authentication → Client-side token
const PADDLE_CLIENT_TOKEN = 'live_4955cbe5e600973480a60eedc6e'; // ← Paddle Dashboard → Developer → Authentication → Client-side token
const PADDLE_MONTHLY_PRICE = 'pri_01kpe8qnd2m40hwa5809wsjajj'; // $7.90/month · 7-day trial
const PADDLE_ANNUAL_PRICE  = 'pri_01kpe94s1a2pe0acfpsssbk17x'; // $79.00/year · 7-day trial

function isPro(){ return isAdmin() || LS.get('aw_pro', false); }

const SYS_BASE = `You are the AI companion for "أنا وياك" (Ana Wyak) — a warm, luxury app for Arab families in the Gulf and worldwide.
Voice: warm, wise, loving — like a trusted family elder who knows both the old ways and the modern world.
Reply in the user's language. Arabic → full Arabic. English → full English. Mixed → both naturally.
Expressions to weave in naturally: يا حبيبي, ماشاء الله, الحمدلله, يا قلبي, بالتوفيق, يا عيوني, الله يرضى عليكم

CULTURAL EXPERTISE: UAE, Saudi Arabia, Qatar, Kuwait, Bahrain, Oman, Jordan, Lebanon, Egypt, Morocco, Arab diaspora globally. Always respect UAE/Gulf public morality. Keep everything romantic, classy, and halal-appropriate.

UAE LUXURY DATE KNOWLEDGE:
• Dubai: Aura Skypool (sunset), Pierchic (over-water dining), Dinner in the Sky, Al Maha Desert Resort, The Farm at Al Barari, Zuma DIFC, Nobu Atlantis, The Arts Club Dubai, Ain Dubai at sunset
• Abu Dhabi: Louvre Abu Dhabi (evening), Qasr Al Sarab Desert Resort, Zuma Abu Dhabi, Rosewood Abu Dhabi, Yas Bay waterfront
• Hidden gems: Al Seef Heritage District, Al Qudra Lakes (stargazing + BBQ), Alserkal Avenue, Kite Beach sunset, Hatta Mountain escape, La Mer beachfront
• For every date: give a FULL ROMANTIC SCENARIO — best arrival time, what to wear, AED cost, ONE magical sentence to say to your partner

COOKING: Specific recipe name, split tasks between Partner A and B simultaneously, make it feel like a date not a chore.
RELATIONSHIP: Practical warm advice. End every reply with ONE concrete action step. 3-5 sentences max. Never lecture. Always love.`;

// Mode-specific system prompt overlays
function getModePrompt() {
  var rel = (profile && profile.rel) || 'couple';
  var base = SYS_BASE;
  if(rel === 'parents') return base + '\n\nUSER MODE: PARENTS — Focus on family rituals, quality time with kids, rekindling romance around a busy family schedule. Practical. Warm. Culturally aware of Gulf family values.';
  if(rel === 'expat')   return base + '\n\nUSER MODE: EXPAT FAMILY — They may be far from home and family. Emphasize connection, timezone awareness, virtual date ideas, and understanding the longing for home. Empathetic above all.';
  if(rel === 'family')  return base + '\n\nUSER MODE: EXTENDED FAMILY — Focus on majlis gatherings, weekend family activities, inter-generational connection, and Gulf hospitality traditions. Inclusive and warm.';
  if(rel === 'solo')    return base + '\n\nUSER MODE: SOLO / FINDING MY PATH — Gentle self-discovery guide. Non-judgmental. Daily reflection prompts. Focus on personal growth, clarity, and self-compassion.';
  return base + '\n\nUSER MODE: COUPLE — Relationship coaching, date ideas, communication, intimacy, anniversary rituals. Gulf cultural context always.';
}

const SYS = SYS_BASE; // legacy alias

const LS={
  get:(k,d)=>{try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch{return d}},
  set:(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}}
};
// Auto-purge old chat on startup (keep last 40 messages, prevent localStorage bloat)
function purgeChatCache(){
  try{
    const msgs=LS.get('aw_chat',[]);
    if(msgs.length>40){LS.set('aw_chat',msgs.slice(-40));}
  }catch(e){}
}

// ── PASSWORD HASHING (SHA-256 via Web Crypto) ──────────────
async function hashPw(pass) {
  const salt = 'anawyak_2026_' + (window.location.hostname||'local');
  const data = new TextEncoder().encode(pass + salt);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

// ── INPUT SANITIZER (XSS prevention) ──────────────────────
function esc(str) {
  if(!str) return '';
  return String(str).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ── CREDITS RESET COUNTDOWN ────────────────────────────────
function timeUntilMidnight() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24,0,0,0);
  const diff = midnight - now;
  const h = Math.floor(diff/3600000);
  const m = Math.floor((diff%3600000)/60000);
  if(isAr) return h>0?(h+' ساعة و'+m+' دقيقة'):(m+' دقيقة');
  return h>0?(h+'h '+m+'m'):(m+'m');
}

let profile   = LS.get('aw_profile',null);
let habits    = LS.get('aw_habits',[]);
let memories  = LS.get('aw_memories',[]);
let occasions = LS.get('aw_occasions',[]);
let dateHist  = LS.get('aw_datehist',[]);
let gratState = LS.get('aw_grat',{days:[],entries:{}});
let secretLang= LS.get('aw_secretlang',[{emoji:'🍣',meaning:'Date night tonight?'},{emoji:'🦉',meaning:'Working late, miss you'},{emoji:'🕊️',meaning:'Peace treaty? I\'m sorry'}]);
let grocery   = LS.get('aw_grocery',[]);
let isAr      = LS.get('aw_lang',false);
let obStep    = 0;
let obVibe    = '';
let obWish    = '';
let obMode    = 'pre'; // 'pre' = pre-auth questions, 'post' = post-signup anniversary

// ══════════════════════════════════════════════════
//  HAPTICS
// ══════════════════════════════════════════════════
const hap={
  tap:()=>navigator.vibrate&&navigator.vibrate(15),
  success:()=>navigator.vibrate&&navigator.vibrate([15,30,15]),
  celebrate:()=>navigator.vibrate&&navigator.vibrate([100,50,100,50,200]),
  error:()=>navigator.vibrate&&navigator.vibrate([50,100,50])
};

// ── RIPPLE EFFECT — adds Material-style ripple to any button click ──
document.addEventListener('click', function(e) {
  var btn = e.target.closest('.btn-rose,.btn-gold,.btn-ghost');
  if(!btn) return;
  var r = document.createElement('span');
  r.className = 'ripple-el';
  var rect = btn.getBoundingClientRect();
  var size = Math.max(rect.width, rect.height);
  r.style.cssText = 'width:'+size+'px;height:'+size+'px;left:'+(e.clientX-rect.left-size/2)+'px;top:'+(e.clientY-rect.top-size/2)+'px';
  btn.appendChild(r);
  setTimeout(function(){ r.remove(); }, 550);
});

// ── SKELETON LOADER helpers ──
function skeletonCard(lines) {
  var lns = (lines||[80,60,40]).map(function(w){
    return '<div class="skeleton skel-line" style="width:'+w+'%"></div>';
  }).join('');
  return '<div class="skel-card">'+lns+'</div>';
}
function skeletonList(n) {
  var html = '';
  for(var i=0;i<(n||3);i++) html += skeletonCard([75,55,35]);
  return html;
}

// ── EMPTY STATE v2 helper ──
function emptyStateV2(icon, title, sub, btnLabel, btnAction) {
  return '<div class="empty-state-v2">' +
    '<div class="es-icon">'+icon+'</div>' +
    '<div class="es-title">'+title+'</div>' +
    '<div class="es-sub">'+sub+'</div>' +
    (btnLabel ? '<button class="btn-rose" onclick="'+btnAction+'" style="max-width:240px;font-size:14px">'+btnLabel+'</button>' : '') +
  '</div>';
}

// ══════════════════════════════════════════════════
//  CREDITS
// ══════════════════════════════════════════════════
// ── DEVICE FINGERPRINT — rate limit survives localStorage clear ──
function getFingerprint(){
  var fp=LS.get('aw_fp','');
  if(!fp){
    fp=btoa([navigator.userAgent.slice(0,30),screen.width+'x'+screen.height,
      navigator.language,new Date().getTimezoneOffset(),
      Math.random().toString(36).slice(2,8)].join('|')).replace(/=/g,'');
    LS.set('aw_fp',fp);
    try{sessionStorage.setItem('aw_fp_s',fp);}catch(e){}
  }
  if(!LS.get('aw_fp','')){
    try{var s=sessionStorage.getItem('aw_fp_s');if(s){LS.set('aw_fp',s);fp=s;}}catch(e){}
  }
  return fp;
}
function getUsage(){
  var fp=getFingerprint();
  var t=new Date().toDateString();
  var k='aw_u_'+fp.slice(0,10);
  // Migrate from old key
  var legacy=LS.get('aw_usage',null);
  if(legacy&&legacy.d===t&&!LS.get(k,null)){LS.set(k,legacy);}
  var u=LS.get(k,{d:'',c:0});
  if(u.d!==t){var f={d:t,c:0};LS.set(k,f);return f;}
  return u;
}
function _proxyActive(){ return !!(LS.get('aw_proxy_url','')||DEFAULT_PROXY); }
function canUse(){ return isAdmin()||LS.get('aw_apikey','')||_proxyActive()||getUsage().c<FREE_LIMIT; }
function useCredit(){
  // Proxy = server-side key = no per-user daily limit (owner bears API cost)
  if(isAdmin()||LS.get('aw_apikey','')||_proxyActive())return true;
  var fp=getFingerprint();
  var k='aw_u_'+fp.slice(0,10);
  var u=getUsage();
  if(u.c>=FREE_LIMIT)return false;
  LS.set(k,{d:u.d,c:u.c+1});return true;
}
function creditsLeft(){ if(isAdmin()||LS.get('aw_apikey','')||_proxyActive())return 999; return FREE_LIMIT-getUsage().c; }
function updateCredits(){
  const el=document.getElementById('credits-badge');if(!el)return;
  if(isAdmin()){ el.textContent='∞ 💬';el.style.color='var(--gold)';return; }
  if(LS.get('aw_apikey','')){ el.textContent='∞ 🔑';el.style.color='var(--sage)';return; }
  if(_proxyActive()){ el.textContent='AI ✅';el.style.color='var(--sage)';return; }
  const l=creditsLeft();el.textContent=l+' 💬';el.style.color=l<=1?'#EF4444':'var(--rose)';
}

// ══════════════════════════════════════════════════
//  API
// ══════════════════════════════════════════════════
async function callAI(msgs,sys,fastMode){
  // Worker URL — triple fallback to guarantee connection
  const WORKER_URL = 'https://anawyak.moh-essa.workers.dev';
  const PROXY_URL  = LS.get('aw_proxy_url','') || DEFAULT_PROXY || WORKER_URL;
  const userKey    = LS.get('aw_apikey','');

  const SYS_PROMPT = sys || (isAr
    ? getModePrompt() + '\nLanguage Behavior: The user interface is Arabic. Respond fully in Arabic unless the user mixes Arabic and English in the prompt.'
    : getModePrompt());

  const reqBody = {
    model: fastMode ? 'claude-haiku-4-5-20251001' : 'claude-sonnet-4-5',
    max_tokens: fastMode ? 200 : 380,
    temperature:0.35,
    system:sys||SYS_PROMPT,
    userMode: (profile && profile.rel) || 'couple',
    messages:msgs
  };

  try{
    let r, rawText, d;

    if(PROXY_URL){
      // MODE A: Cloudflare Worker proxy (key stays on server)
      r = await fetch(PROXY_URL,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(reqBody)
      });
      rawText = await r.text();

      // Detect misconfigured Worker (still Hello World or returns HTML)
      if(!rawText || rawText.trim().startsWith('Hello') || rawText.trim().startsWith('<')){
        console.error('[AW] Worker returned non-JSON:', rawText.slice(0,80));
        return isAr
          ?'⚠️ الـ Worker لا يرد بشكل صحيح. الصق كود cloudflare-worker.js في Cloudflare ثم اضغط Deploy.'
          :'⚠️ Worker not configured. Paste cloudflare-worker.js code in Cloudflare then Deploy.';
      }
      try { d = JSON.parse(rawText); }
      catch(pe){
        console.error('[AW] JSON parse fail:', rawText.slice(0,100));
        return isAr?'خطأ في الاستجابة. حاول مجدداً.':'Response error. Try again.';
      }

    } else if(userKey){
      // MODE B: User personal API key (direct to Anthropic)
      r = await fetch(API_URL,{
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'x-api-key':userKey,
          'anthropic-version':'2023-06-01',
          'anthropic-dangerous-direct-browser-access':'true'
        },
        body:JSON.stringify(reqBody)
      });
      d = await r.json();

    } else {
      // MODE C: Nothing configured
      return isAr
        ?'💡 لتفعيل الذكاء الاصطناعي، أضف مفتاحك في الملف الشخصي. مجاناً من console.anthropic.com'
        :'💡 To activate AI, add your key in Profile. Free at console.anthropic.com';
    }

    // Handle Anthropic API errors
    if(!d){ return isAr?'لا يوجد رد.':'No response.'; }
    if(d.error || d.type==='error'){
      const e=d.error||d;
      // e can be a string (Worker error) or object (Anthropic error)
      const msg=(typeof e==='string'?e:(e.message||'')).toLowerCase();
      if(msg.includes('anthropic_api_key') || msg.includes('not set') || msg.includes('not configured'))
        return isAr?'🔑 مفتاح Anthropic غير مضاف في Cloudflare. اذهب إلى Workers → Settings → Variables → أضف ANTHROPIC_API_KEY كـ Secret.':'🔑 ANTHROPIC_API_KEY not set in Cloudflare Worker. Go to Workers → Settings → Variables → Add ANTHROPIC_API_KEY as a Secret, then redeploy.';
      if(msg.includes('exceeded') || r.status===429)
        return isAr?'⏰ تجاوز الحد. يتجدد خلال '+timeUntilMidnight()+' 💕':'⏰ Limit reached. Renews in '+timeUntilMidnight()+' 💕';
      if(msg.includes('api_key') || msg.includes('auth') || msg.includes('invalid') || r.status===401)
        return isAr?'🔑 مفتاح API غير صحيح. تحقق من ANTHROPIC_API_KEY في Cloudflare Secrets.':'🔑 Invalid API key. Check ANTHROPIC_API_KEY in Cloudflare Secrets.';
      if(msg.includes('overloaded') || r.status===529)
        return isAr?'⏳ Anthropic مشغول الآن. انتظر دقيقة وأعد المحاولة.':'⏳ Anthropic busy. Wait a minute and retry.';
      console.error('[AW] Anthropic error:', e);
      const errText = typeof e==='string' ? e : (e.message||'try again');
      return isAr?'خطأ: '+errText:'Error: '+errText;
    }

    const reply = d.content?.[0]?.text || '...';

  // Offline AI cache: keep last 5 responses
  try {
    var cache = LS.get('aw_ai_cache', []);
    cache.unshift({q: JSON.stringify(msgs.slice(-1)), a: reply, t: Date.now()});
    LS.set('aw_ai_cache', cache.slice(0, 5));
  } catch(ce) {}

  return reply;

  } catch(e){
    console.error('[AW] callAI exception:', e.message);

    // Serve from offline cache when network is unavailable
    try {
      var cached = LS.get('aw_ai_cache', []);
      if(cached.length){
        var offline = cached[0].a;
        return (isAr ? '📴 وضع بلا إنترنت — آخر رد:\n\n' : '📴 Offline mode — last response:\n\n') + offline;
      }
    } catch(ce2) {}

    if(e.message && e.message.includes('fetch'))
      return isAr?'لا يمكن الوصول للـ Worker. تأكد من رفع الكود على Cloudflare.':'Cannot reach Worker. Make sure worker code is deployed on Cloudflare.';
    return isAr?'مشكلة في الاتصال: '+e.message:'Connection error: '+e.message;
  }
}
// ── VERIFICATION EMAIL — sends via Cloudflare Worker → Resend ──
// Request a server-generated verification code (rate-limited, stored in KV)
async function requestVerificationCode(email, name, type) {
  try {
    var r = await fetch(DEFAULT_PROXY + '/request-code', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({email: email, name: name || '', type: type || 'signup'})
    });
    var d = await r.json().catch(function(){ return {}; });
    // d.ok = true always if request succeeded
    // d.fallback = true + d.code = code when email failed (show on screen)
    // d.error = 'rate_limited' when too many attempts
    return d;
  } catch(e) { return {ok: false, error: 'network_error'}; }
}

// Verify a code against the server (one-time, expires in 10 min)
async function verifyCodeOnServer(email, code) {
  try {
    var r = await fetch(DEFAULT_PROXY + '/verify-code', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({email: email, code: code})
    });
    var d = await r.json().catch(function(){ return {}; });
    return d; // {ok, verified, error, attemptsLeft}
  } catch(e) { return {ok: false, error: 'network_error'}; }
}

// ── LEAD STORAGE — stores to Supabase via Worker for marketing ──
function storeLead(data) {
  try {
    fetch('https://anawyak.moh-essa.workers.dev/store-lead', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(data)
    }).catch(function(){});
  } catch(e) {}
}

// ── AUTO-FILL — tapping the displayed code fills the input ──
function autoFillCode(code) {
  var inp = document.getElementById('verify-code');
  if(inp){ inp.value = code; inp.focus(); }
  if(navigator.clipboard) navigator.clipboard.writeText(code).catch(function(){});
  hap.success();
  T(isAr ? '✅ تم النسخ — اضغط تفعيل الحساب' : '✅ Code filled — tap Activate');
}

// ══════════════════════════════════════════════════
//  PADDLE CHECKOUT
// ══════════════════════════════════════════════════
function initPaddle() {
  if(!PADDLE_CLIENT_TOKEN || PADDLE_CLIENT_TOKEN.includes('REPLACE')) return;
  if(typeof Paddle === 'undefined') return;
  Paddle.Initialize({
    token: PADDLE_CLIENT_TOKEN,
    eventCallback: function(ev) {
      if(ev.name === 'checkout.completed') {
        LS.set('aw_pro', true);
        if(profile){ profile.pro = true; LS.set('aw_profile', profile); }
        hap.celebrate();
        setTimeout(function(){
          T(isAr ? '🎉 أنا وياك Pro مفعّل! جميع الميزات متاحة 💕' : '🎉 Ana Wyak Pro activated! All features unlocked 💕', 5000);
          showTab('profile');
        }, 500);
      }
    }
  });
}

function openPaddleCheckout(priceId) {
  // Direct Paddle checkout links (always work as fallback)
  var isAnnual = priceId === PADDLE_ANNUAL_PRICE;
  var directLink = isAnnual
    ? 'https://buy.paddle.com/product/' + PADDLE_ANNUAL_PRICE
    : 'https://buy.paddle.com/product/' + PADDLE_MONTHLY_PRICE;

  if(!PADDLE_CLIENT_TOKEN || PADDLE_CLIENT_TOKEN.includes('REPLACE') || PADDLE_CLIENT_TOKEN.length < 10) {
    window.open(directLink, '_blank');
    T(isAr ? 'جارٍ فتح صفحة الدفع...' : 'Opening payment page...'); return;
  }
  if(typeof Paddle === 'undefined') {
    T(isAr ? 'جارٍ تحميل نظام الدفع...' : 'Loading payment...'); hap.tap();
    setTimeout(function(){ openPaddleCheckout(priceId); }, 1500);
    return;
  }
  var customerEmail = '';
  var accounts = LS.get('aw_accounts', []);
  if(profile) {
    var me = accounts.find(function(a){ return a.profile && a.profile.code === profile.code; });
    if(me) customerEmail = me.email || '';
  }
  try {
    Paddle.Checkout.open({
      items: [{ priceId: priceId, quantity: 1 }],
      customer: customerEmail ? { email: customerEmail } : {},
      settings: { displayMode: 'overlay', theme: 'dark', locale: isAr ? 'ar' : 'en' },
      successUrl: window.location.origin + window.location.pathname + '?paddle_success=1'
    });
    hap.tap();
  } catch(e) {
    console.error('[AW Paddle]', e);
    // Paddle SDK failed — open direct link + show contact
    showCheckoutFallback(directLink, isAnnual);
  }
}

function showCheckoutFallback(link, isAnnual){
  var existing = document.getElementById('checkout-fallback');
  if(existing) existing.remove();
  var price = isAnnual ? (isAr?'290 درهم/سنة':'AED 290/year') : (isAr?'29 درهم/شهر':'AED 29/month');
  var div = document.createElement('div');
  div.id = 'checkout-fallback';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);backdrop-filter:blur(4px);z-index:9998;display:flex;align-items:flex-end;justify-content:center';
  div.onclick = function(e){ if(e.target===div) div.remove(); };
  div.innerHTML =
    '<div style="background:var(--card);border-radius:24px 24px 0 0;padding:28px 24px 40px;width:100%;max-width:480px">' +
      '<div style="width:36px;height:4px;background:var(--border);border-radius:2px;margin:0 auto 20px"></div>' +
      '<div style="text-align:center;margin-bottom:20px">' +
        '<div style="font-size:40px;margin-bottom:8px">💳</div>' +
        '<div style="font-family:\'Cormorant Garamond\',serif;font-size:22px;font-weight:700;color:var(--gold);margin-bottom:6px">أنا وياك Pro</div>' +
        '<div style="font-size:24px;font-weight:800;color:var(--rose);margin-bottom:4px">' + price + '</div>' +
        '<div style="font-size:12px;color:var(--text-soft);margin-bottom:16px">' + (isAr?'تجربة مجانية 7 أيام — لا رسوم الآن':'7-day free trial — no charge today') + '</div>' +
      '</div>' +
      '<a href="' + link + '" target="_blank" onclick="document.getElementById(\'checkout-fallback\').remove()" class="btn-gold" style="display:block;text-align:center;padding:16px;font-size:15px;font-weight:800;text-decoration:none;margin-bottom:12px;border-radius:50px">' +
        (isAr?'🚀 اشترك الآن':'🚀 Subscribe Now') +
      '</a>' +
      '<button onclick="showContactModal();document.getElementById(\'checkout-fallback\').remove()" style="width:100%;background:none;border:1px solid rgba(232,132,154,.3);color:var(--rose);border-radius:20px;padding:12px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;margin-bottom:12px">' +
        (isAr?'📧 تواصل مع الدعم':'📧 Contact Support') +
      '</button>' +
      '<button onclick="document.getElementById(\'checkout-fallback\').remove()" style="width:100%;background:none;border:none;color:var(--text-soft);font-size:13px;cursor:pointer;font-family:inherit;padding:8px">' +
        (isAr?'لاحقاً':'Maybe later') +
      '</button>' +
    '</div>';
  document.body.appendChild(div);
  hap.tap();
}

function checkPaddleSuccess() {
  var params = new URLSearchParams(window.location.search);
  if(params.get('paddle_success') !== '1') return;
  window.history.replaceState({}, '', window.location.pathname);
  LS.set('aw_pro', true);
  if(profile){ profile.pro = true; LS.set('aw_profile', profile); }
  hap.celebrate();
  T(isAr ? '🎉 Pro مفعّل! جميع الميزات متاحة 💕' : '🎉 Pro activated! All features unlocked 💕', 5000);
}

// ══════════════════════════════════════════════════
//  PARTNER REAL-TIME SYNC
// ══════════════════════════════════════════════════
var _syncInterval = null;
var _partnerLastSeen = null;

function getShareableState() {
  return {
    code:      profile ? profile.code : '',
    n1:        profile ? profile.n1 : '',
    n2:        profile ? profile.n2 : '',
    vibe:      profile ? profile.vibe : '',
    profile:   profile ? { n1: profile.n1, n2: profile.n2, fam: profile.fam, rel: profile.rel } : {},
    occasions: occasions.slice(0, 15),
    grocery:   grocery.slice(0, 30),
    secretLang: secretLang,
    lastSeen:  new Date().toISOString()
  };
}

async function syncToCloud() {
  if(!profile || !profile.code) return;
  try {
    fetch('https://anawyak.moh-essa.workers.dev/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(getShareableState())
    }).catch(function(){});
  } catch(e) {}
}

async function fetchPartnerSync(partnerCode) {
  try {
    var r = await fetch('https://anawyak.moh-essa.workers.dev/partner/' + partnerCode.toUpperCase());
    if(!r.ok) return null;
    var d = await r.json();
    return d.ok ? d.data : null;
  } catch(e) { return null; }
}

function linkPartner() {
  var inp = document.getElementById('partner-code-inp');
  var code = (inp ? inp.value : '').trim().toUpperCase();
  if(!code || code.length < 4) { T(isAr ? 'أدخل كود شريكك' : "Enter partner's code"); hap.error(); return; }
  if(code === getCode()) { T(isAr ? 'هذا كودك أنت!' : "That's your own code!"); hap.error(); return; }
  LS.set('aw_partner_code', code);
  hap.celebrate();
  T(isAr ? '🔗 جارٍ الربط...' : '🔗 Linking...');
  startPartnerSync();
  // Show chat FAB
  var chatFab = document.getElementById('chat-fab');
  if(chatFab) chatFab.classList.add('show');
  setTimeout(function(){ showTab('profile'); }, 600);
}

function unlinkPartner() {
  LS.set('aw_partner_code', '');
  if(_syncInterval) { clearInterval(_syncInterval); _syncInterval = null; }
  hap.tap(); showTab('profile');
  T(isAr ? 'تم إلغاء الربط' : 'Partner unlinked');
}

function applyPartnerData(data) {
  if(!data) return;
  // Merge partner occasions (add new ones, don't overwrite)
  var existingIds = occasions.map(function(o){ return o.id; });
  var newOccs = (data.occasions || []).filter(function(o){ return !existingIds.includes(o.id); });
  if(newOccs.length) {
    occasions = occasions.concat(newOccs);
    LS.set('aw_occasions', occasions);
  }
  // Merge grocery (partner's unchecked items not already listed)
  var existingItems = grocery.map(function(g){ return g.item; });
  var newItems = (data.grocery || []).filter(function(g){ return !g.checked && !existingItems.includes(g.item); });
  if(newItems.length) {
    grocery = grocery.concat(newItems);
    LS.set('aw_grocery', grocery);
  }
  // Update partner name if available
  if(data.profile && data.profile.n1) {
    LS.set('aw_partner_name', data.profile.n1);
  }
  // Track partner online status
  if(data.lastSeen) {
    LS.set('aw_partner_last_active', new Date(data.lastSeen).getTime());
  }
  // Update last seen
  if(data.lastSeen !== _partnerLastSeen) {
    _partnerLastSeen = data.lastSeen;
    return true; // changed
  }
  return false;
}

function startPartnerSync() {
  if(_syncInterval) clearInterval(_syncInterval);
  syncToCloud();
  var partnerCode = LS.get('aw_partner_code', '');
  if(!partnerCode) return;
  fetchPartnerSync(partnerCode).then(function(data) {
    if(data) {
      var changed = applyPartnerData(data);
      if(changed) T(isAr ? '🔗 تم مزامنة بيانات شريكك ✨' : '🔗 Partner data synced ✨');
    }
  });
  _syncInterval = setInterval(function() {
    syncToCloud();
    var pc = LS.get('aw_partner_code', '');
    if(!pc) { clearInterval(_syncInterval); _syncInterval = null; return; }
    fetchPartnerSync(pc).then(function(data) {
      if(data) {
        var changed = applyPartnerData(data);
        if(changed) {
          T(isAr ? '🔗 شريكك حدّث البيانات ✨' : '🔗 Partner updated ✨');
          var activeEl = document.querySelector('.tab-screen.active');
          if(activeEl) {
            var tabId = activeEl.id;
            if(tabId === 'tab-memories') showTab('memories');
            if(tabId === 'tab-cook') showTab('cook');
          }
        }
      }
    });
    // Poll chat messages if sheet is open
    if(document.getElementById('chat-sh') && document.getElementById('chat-sh').style.display !== 'none') {
      pollChatMessages();
    } else {
      checkChatUnread();
    }
  }, 5000); // 5s near-real-time sync
}

// ══════════════════════════════════════════════════
//  SERVICE WORKER UPDATE DETECTION
// ══════════════════════════════════════════════════
function setupSWUpdateDetection() {
  if(!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('controllerchange', function() {
    if(document._awReloading) return;
    document._awReloading = true;
    window.location.reload();
  });
  navigator.serviceWorker.ready.then(function(reg) {
    reg.addEventListener('updatefound', function() {
      var nw = reg.installing;
      nw.addEventListener('statechange', function() {
        if(nw.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdateBanner();
        }
      });
    });
  });
}

function showUpdateBanner() {
  if(document.getElementById('aw-update-banner')) return;
  var b = document.createElement('div');
  b.id = 'aw-update-banner';
  b.style.cssText = 'position:fixed;top:max(12px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);background:var(--text);color:var(--cream);border-radius:50px;padding:10px 18px;font-size:13px;font-weight:700;z-index:9999;white-space:nowrap;display:flex;align-items:center;gap:10px;box-shadow:0 4px 20px rgba(0,0,0,.5);animation:fadeUp .3s ease;cursor:pointer';
  b.innerHTML = '✨ ' + (isAr ? 'تحديث جديد متاح' : 'New update ready') +
    '<button onclick="window.location.reload()" style="background:var(--rose);color:#fff;border:none;border-radius:20px;padding:4px 14px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">' +
    (isAr ? 'تحديث' : 'Refresh') + '</button>' +
    '<button onclick="this.parentElement.remove()" style="background:none;border:none;color:var(--text-soft);font-size:18px;cursor:pointer;line-height:1">×</button>';
  document.body.appendChild(b);
}

// Debounce flag — prevents double AI calls (race condition fix)
var _aiLock = false;
var _tonightLock = false;
var _cookLock = false;
var _dateLock = false;
var tonightHistory = [];
async function sendChat(text){
  if(_aiLock) return; // prevent concurrent AI calls
  const inp=document.getElementById('chat-in');
  const msg=text||(inp?inp.value.trim():'');
  if(!msg)return;
  if(!canUse()){showPaywall();return}
  if(!useCredit()){showPaywall();return}
  if(inp)inp.value='';hap.tap();_aiLock=true;
  const msgs=LS.get('aw_chat',[]);
  const tm=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  msgs.push({r:'user',txt:msg,t:tm});LS.set('aw_chat',msgs.slice(-60));
  rCoach(document.getElementById('tab-coach'));
  setTimeout(()=>{const ty=document.getElementById('typing');if(ty)ty.style.display='block';const c=document.getElementById('chat-area');if(c)c.scrollTop=c.scrollHeight},60);
  const reply=await callAI(msgs.map(m=>({role:m.r,content:m.txt})), getModePrompt());
  const msgs2=LS.get('aw_chat',[]);
  msgs2.push({r:'assistant',txt:reply,t:tm,err:reply.startsWith('⏰')});
  LS.set('aw_chat',msgs2.slice(-60));hap.success();
  _aiLock=false;updateCredits();rCoach(document.getElementById('tab-coach'));
  setTimeout(()=>{const c=document.getElementById('chat-area');if(c)c.scrollTop=c.scrollHeight},200);
}

// ══════════════════════════════════════════════════
//  COOK TAB (CHEF MOOD ENGINE)
// ══════════════════════════════════════════════════
const COOK_TASKS_EN=["Partner A: Wash & chop vegetables 🥕","Partner B: Measure & prepare spices 🌶️","Partner A: Heat pan and add oil 🍳","Partner B: Mix sauce ingredients 🥣","Partner A: Add to pan and sauté 👨‍🍳","Partner B: Stir, season & taste 🧂","Together: Set the table beautifully 🌹","Together: Light a candle & enjoy! 💕"];
const COOK_TASKS_AR=["الشريك أ: اغسل وقطع الخضروات 🥕","الشريك ب: قِس وحضّر التوابل 🌶️","الشريك أ: سخّن المقلاة وأضف الزيت 🍳","الشريك ب: اخلط الصلصة 🥣","الشريك أ: أضف المكونات وقلّب 👨‍🍳","الشريك ب: قلّب وعدّل التتبيل 🧂","معاً: رتّبا الطاولة بشكل جميل 🌹","معاً: اشعلا شمعة واستمتعا! 💕"];
let _tInt=null,_tSecs=0,_tRun=false,_tTask=0,_cookMood='',_cookMoodN='';

function rCook(el){
  const moods=[{e:'😴',n:isAr?'تعبانين وكيفيين':'Tired & Cozy',k:'cozy'},{e:'🎉',n:isAr?'احتفاليين':'Celebratory',k:'fancy'},{e:'🥗',n:isAr?'صحيين':'Healthy',k:'healthy'},{e:'💕',n:isAr?'رومانسيين':'Romantic',k:'romantic'},{e:'🌶️',n:isAr?'مغامرين':'Adventurous',k:'adventurous'}];
  const cuisines=[{f:'🇸🇦',n:'Saudi',a:'سعودي',d:['كبسة','مندي','جريش','هريس','مطبق']},{f:'🇦🇪',n:'Emirati',a:'إماراتي',d:['مجبوس','بلاليط','لقيمات','ثريد','هريس']},{f:'🇱🇧',n:'Lebanese',a:'لبناني',d:['شاورما','كبة','تبولة','لبنة بالزعتر','مجدرة']},{f:'🇪🇬',n:'Egyptian',a:'مصري',d:['كشري','ملوخية','فول','شكشوكة','كفتة']},{f:'🇲🇦',n:'Moroccan',a:'مغربي',d:['طاجين','كسكس','بسطيلة','حريرة','مرقة']},{f:'🇮🇹',n:'Italian',a:'إيطالي',d:['Truffle Risotto','Carbonara','Ossobuco','Tiramisu','Bruschetta']},{f:'🇯🇵',n:'Japanese',a:'ياباني',d:['Sushi DIY','Ramen','Teriyaki Chicken','Gyoza','Miso Soup']},{f:'🇮🇳',n:'Indian',a:'هندي',d:['Butter Chicken','Biryani','Dal Makhani','Palak Paneer','Naan']},{f:'🇬🇷',n:'Greek',a:'يوناني',d:['Moussaka','Souvlaki','Spanakopita','Tzatziki','Baklava']},{f:'🇲🇽',n:'Mexican',a:'مكسيكي',d:['Tacos al Pastor','Guacamole','Enchiladas','Churros','Pozole']},{f:'🇹🇷',n:'Turkish',a:'تركي',d:['Lahmacun','Kebabs','Borek','Baklava','Ayran']},{f:'🇫🇷',n:'French',a:'فرنسي',d:['Ratatouille','Coq au Vin','Croque Monsieur','Crème Brûlée','Quiche']},{f:'🇹🇭',n:'Thai',a:'تايلاندي',d:['Pad Thai','Green Curry','Tom Yum','Mango Sticky Rice','Som Tam']},{f:'🇪🇸',n:'Spanish',a:'إسباني',d:['Paella','Tapas','Churros','Gazpacho','Tortilla Española']},{f:'🇮🇷',n:'Persian',a:'فارسي',d:['Fesenjan','Ghormeh Sabzi','Kebab','Tahdig','Zereshk Polo']},{f:'🇨🇳',n:'Chinese',a:'صيني',d:['Kung Pao Chicken','Dumplings','Sweet & Sour Pork','Mapo Tofu','Fried Rice']},{f:'🇰🇷',n:'Korean',a:'كوري',d:['Bibimbap','Bulgogi','Kimchi Stew','Japchae','Korean BBQ']},{f:'🇺🇸',n:'American',a:'أمريكي',d:['BBQ Ribs','Burgers','Mac & Cheese','Pancakes','Apple Pie']},{f:'🇻🇳',n:'Vietnamese',a:'فيتنامي',d:['Pho','Banh Mi','Spring Rolls','Bun Cha','Vietnamese Coffee']},{f:'🇧🇷',n:'Brazilian',a:'برازيلي',d:['Feijoada','Pão de Queijo','Moqueca','Brigadeiro','Coxinha']}];
  const topDishes = cuisines.flatMap(function(c){ return c.d; }).slice(0,30);
  const topSoups = ['Tom Yum','Miso Soup','Gazpacho','French Onion','Pho','Harira','Shorbat Adas','Borscht','Minestrone','Laksa','Avgolemono','Lentil Soup','Tomato Basil','Caldo Verde','Goulash','Matzo Ball','Chorba','Consommé','Chicken Noodle','Clam Chowder','Sinigang','Corn Chowder','Chicken Mulligatawny','Pumpkin Soup','Hot and Sour','Egg Drop','Lentil Dal','Seafood Bisque','Miso Ramen','Cream of Mushroom'];
  const topDesserts = ['Tiramisu','Baklava','Crème Brûlée','Mango Sticky Rice','Churros','Pavlova','Gulab Jamun','Knafeh','Basbousa','Kanafeh','Macarons','Pastel de Nata','Tres Leches','Chocolate Fondant','Baklava Rolls','Rice Pudding','Mochi','Affogato','Cheesecake','Panna Cotta','Crepes','Sticky Toffee Pudding','Sahlab','Qatayef','Halva','Banoffee Pie','Coconut Macaroons','Brigadeiro','Loukoumades','Poached Pears'];
  el.innerHTML=`<div class="container">
  <button class="back-btn" onclick="showTab('home')">← ${isAr?'رجوع':'Back'}</button>
  <div style="margin-bottom:20px"><div style="font-size:24px;font-weight:700;font-family:'Cormorant Garamond',serif">${isAr?'ماذا سنطبخ، شيف؟ 👨‍🍳':'What to Cook, Chef? 👨‍🍳'}</div><div style="font-size:14px;color:var(--text-soft)">${isAr?'تحدي طبخ مشترك':'Shared cooking challenge'}</div></div>

  <div class="chef-card" style="margin-bottom:20px">
    <div style="font-size:13px;font-weight:800;color:var(--gold-light);text-transform:uppercase;letter-spacing:.08em;margin-bottom:14px">🎭 ${isAr?'محرك المزاج':'Mood Engine'}</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px">${moods.map(m=>`<span class="chip" id="cm-${m.k}" onclick="pickMood('${m.k}','${m.n}',this)" style="background:rgba(255,255,255,.06);border-color:rgba(201,149,74,.3);color:var(--gold-light)">${m.e} ${m.n}</span>`).join('')}</div>
    <div id="cook-mood-txt" style="font-size:13px;color:rgba(255,255,255,.4);margin-bottom:14px">${isAr?'اختر مزاجك للبدء':'Select your mood above'}</div>
    <button class="btn-gold" onclick="getCookSug()" style="padding:12px;font-size:14px">🍳 ${isAr?'اقترح وصفة':'Suggest a Recipe'}</button>
    <div id="cook-res" style="margin-top:12px"></div>
  </div>

  <div id="grocery-sec" style="display:${grocery.length>0?'block':'none'};margin-bottom:20px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <div style="font-size:14px;font-weight:700;color:var(--text-mid)">🛒 ${isAr?'قائمة المشتريات':'Grocery List'}</div>
      <button onclick="clearChecked()" style="background:none;border:none;color:var(--text-soft);font-size:12px;cursor:pointer;font-family:inherit;text-decoration:underline">${isAr?'مسح المكتمل':'Clear Completed'}</button>
    </div>
    <div class="card" style="padding:16px"><div id="grocery-list">${groceryHTML()}</div></div>
  </div>

  <div class="card" style="padding:20px;margin-bottom:20px">
    <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:16px">⏱️ ${isAr?'مؤقت الطبخ معاً — يتبادل المهام كل دقيقتين':'Cooking Timer — Tasks switch every 2 min'}</div>
    <div class="timer-ring" id="timer-disp">00:00</div>
    <div id="task-disp" style="text-align:center;margin-top:16px;font-size:14px;color:var(--text-mid);line-height:1.6;min-height:44px;padding:8px">${(isAr?COOK_TASKS_AR:COOK_TASKS_EN)[0]}</div>
    <div style="display:flex;gap:10px;margin-top:16px">
      <button onclick="startTimer()" class="btn-rose" style="padding:12px;font-size:14px">${isAr?'▶ ابدأ':'▶ Start'}</button>
      <button onclick="resetTimer()" class="btn-ghost" style="padding:12px;font-size:14px">${isAr?'↺ إعادة':'↺ Reset'}</button>
    </div>
  </div>

  <!-- COLLAPSIBLE: Cuisines -->
  <div class="card" style="padding:0;margin-bottom:12px;overflow:hidden">
    <div onclick="toggleCookSection('cuisines')" style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;cursor:pointer;user-select:none">
      <div style="font-size:14px;font-weight:700;color:var(--text-mid)">🌍 ${isAr?'المطابخ العالمية':'World Cuisines'} <span style="font-size:11px;color:var(--text-soft)">(${cuisines.length})</span></div>
      <span id="sect-cuisines-icon" style="color:var(--rose);font-size:16px;transition:transform .2s">▼</span>
    </div>
    <div id="sect-cuisines" style="display:none;padding:0 12px 12px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${(window._CD=cuisines,cuisines).map((c,_i)=>'<div class="card tap" onclick="showDishes('+_i+')" style="padding:12px;display:flex;align-items:center;gap:8px;margin:0"><span style="font-size:22px">'+c.f+'</span><div><div style="font-weight:700;font-size:12px;color:var(--text)">'+(isAr?c.a:c.n)+'</div><div style="font-size:10px;color:var(--text-soft);margin-top:1px">'+c.d.slice(0,2).join(' · ')+'</div></div></div>').join('')}</div>
      <div id="dishes-sec" style="margin-top:12px"></div>
    </div>
  </div>

  <!-- COLLAPSIBLE: Top Dishes -->
  <div class="card" style="padding:0;margin-bottom:12px;overflow:hidden">
    <div onclick="toggleCookSection('dishes')" style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;cursor:pointer;user-select:none">
      <div style="font-size:14px;font-weight:700;color:var(--text-mid)">⭐ ${isAr?'أفضل الأطباق':'Top Dishes'} <span style="font-size:11px;color:var(--text-soft)">(30)</span></div>
      <span id="sect-dishes-icon" style="color:var(--rose);font-size:16px;transition:transform .2s">▼</span>
    </div>
    <div id="sect-dishes" style="display:none;padding:0 12px 12px">
      <div style="display:flex;flex-wrap:wrap;gap:6px">${topDishes.map(function(d){ return '<span class="chip" onclick="promptDishRecipe(\''+d.replace(/'/g,'&#39;')+'\')" style="font-size:12px">'+d+'</span>'; }).join('')}</div>
    </div>
  </div>

  <!-- COLLAPSIBLE: Top Soups -->
  <div class="card" style="padding:0;margin-bottom:12px;overflow:hidden">
    <div onclick="toggleCookSection('soups')" style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;cursor:pointer;user-select:none">
      <div style="font-size:14px;font-weight:700;color:var(--text-mid)">🍲 ${isAr?'أفضل الحساء':'Top Soups'} <span style="font-size:11px;color:var(--text-soft)">(30)</span></div>
      <span id="sect-soups-icon" style="color:var(--rose);font-size:16px;transition:transform .2s">▼</span>
    </div>
    <div id="sect-soups" style="display:none;padding:0 12px 12px">
      <div style="display:flex;flex-wrap:wrap;gap:6px">${topSoups.map(function(d){ return '<span class="chip" onclick="promptDishRecipe(\''+d.replace(/'/g,'&#39;')+'\')" style="font-size:12px">'+d+'</span>'; }).join('')}</div>
    </div>
  </div>

  <!-- COLLAPSIBLE: Top Desserts -->
  <div class="card" style="padding:0;margin-bottom:20px;overflow:hidden">
    <div onclick="toggleCookSection('desserts')" style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;cursor:pointer;user-select:none">
      <div style="font-size:14px;font-weight:700;color:var(--text-mid)">🍰 ${isAr?'أفضل الحلويات':'Top Desserts'} <span style="font-size:11px;color:var(--text-soft)">(30)</span></div>
      <span id="sect-desserts-icon" style="color:var(--rose);font-size:16px;transition:transform .2s">▼</span>
    </div>
    <div id="sect-desserts" style="display:none;padding:0 12px 12px">
      <div style="display:flex;flex-wrap:wrap;gap:6px">${topDesserts.map(function(d){ return '<span class="chip" onclick="promptDishRecipe(\''+d.replace(/'/g,'&#39;')+'\')" style="font-size:12px">'+d+'</span>'; }).join('')}</div>
    </div>
  </div>

  </div>`;
}

function toggleCookSection(name) {
  var body = document.getElementById('sect-'+name);
  var icon = document.getElementById('sect-'+name+'-icon');
  if(!body) return;
  var isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  if(icon) { icon.textContent = isOpen ? '▼' : '▲'; icon.style.color = isOpen ? 'var(--rose)' : 'var(--gold)'; }
  if(!isOpen) body.scrollIntoView({behavior:'smooth', block:'nearest'});
  hap.tap();
}

function groceryHTML(){
  if(!grocery.length)return`<div style="text-align:center;color:var(--text-soft);font-size:13px;padding:12px">${isAr?'القائمة فارغة':'List is empty'}</div>`;
  return grocery.map(g=>`<div class="grocery-item"><div class="check-circle ${g.checked?'checked':''}" onclick="toggleGrocery(${g.id})">${g.checked?'✓':''}</div><div style="flex:1;font-size:14px;color:var(--text);${g.checked?'text-decoration:line-through;opacity:.5':''}">${g.item}</div><div class="cat-tag">${g.cat}</div></div>`).join('');
}
function toggleGrocery(id){const idx=grocery.findIndex(g=>g.id===id);if(idx!==-1){grocery[idx].checked=!grocery[idx].checked;LS.set('aw_grocery',grocery);hap.tap();const gl=document.getElementById('grocery-list');if(gl)gl.innerHTML=groceryHTML()}}
function clearChecked(){grocery=grocery.filter(g=>!g.checked);LS.set('aw_grocery',grocery);hap.success();const gl=document.getElementById('grocery-list');if(gl)gl.innerHTML=groceryHTML()}
function addGroceryItems(items,recipeName){
  items.forEach(i=>{if(!grocery.some(g=>g.item===i.item))grocery.push({...i,checked:false,id:Date.now()+Math.random()})});
  LS.set('aw_grocery',grocery);hap.success();
  const sec=document.getElementById('grocery-sec');if(sec)sec.style.display='block';
  const gl=document.getElementById('grocery-list');if(gl)gl.innerHTML=groceryHTML();
}

let _cookMoodKey='',_cookMoodName='';
function pickMood(k,n,el){_cookMoodKey=k;_cookMoodName=n;document.querySelectorAll('[id^="cm-"]').forEach(c=>{c.classList.remove('active');c.style.background='rgba(255,255,255,.06)';c.style.borderColor='rgba(201,149,74,.3)';c.style.color='var(--gold-light)'});el.classList.add('active');el.style.background='var(--rose-glow)';el.style.borderColor='var(--rose)';el.style.color='var(--rose)';const t=document.getElementById('cook-mood-txt');if(t)t.textContent=(isAr?'مزاجكم: ':'Mood: ')+n;hap.tap()}

async function getCookSug(){
  if(_cookLock) return;
  if(!canUse()){showPaywall();return}
  if(!_cookMoodKey){T(isAr?'اختر مزاجك أولاً':'Select your mood first');hap.error();return}
  _cookLock = true;
  var cookBtn = document.querySelector('button[onclick="getCookSug()"]');
  if(cookBtn){cookBtn.disabled=true; cookBtn.style.opacity='.7'; cookBtn.style.cursor='not-allowed';}
  const res=document.getElementById('cook-res');if(!res){_cookLock=false; if(cookBtn){cookBtn.disabled=false;cookBtn.style.opacity='1';cookBtn.style.cursor='pointer';} return;}
  res.innerHTML=`<div style="text-align:center;padding:14px;color:rgba(255,255,255,.5)"><div class="typing-dots"><span></span><span></span><span></span></div><div style="font-size:13px;margin-top:6px">${isAr?'يفكر... 🍳':'Thinking... 🍳'}</div></div>`;
  useCredit();const p=profile||{};
  const moodMap={cozy:isAr?'طبق دافئ ومريح':'warm comfort food',fancy:isAr?'طبق احتفالي':'celebratory dish',healthy:isAr?'طبق خفيف وصحي':'light healthy dish',romantic:isAr?'طبق رومانسي لشخصين':'romantic dish for two',adventurous:isAr?'وصفة مغامرة من مطابخ العالم':'bold adventurous recipe'};
  const prompt=isAr?`اقترح وصفة واحدة محددة لـ ${p.n1||'الشريك أ'} و${p.n2||'الشريك ب'} يطبخانها معاً. مزاجهم: "${_cookMoodName}" — ${moodMap[_cookMoodKey]}. اذكر: اسم الطبق، المكونات الرئيسية (5-6)، وقسّم المهام: ${p.n1||'الشريك أ'} يفعل X و${p.n2||'الشريك ب'} يفعل Y. اجعلها مرحة ورومانسية. اجعل الرد موجزاً وقصيراً.`:`Suggest ONE specific recipe for ${p.n1||'Partner A'} and ${p.n2||'Partner B'} to cook together. Mood: "${_cookMoodName}" — ${moodMap[_cookMoodKey]}. Include: dish name, 5-6 key ingredients (list them clearly), and divide tasks: ${p.n1||'Partner A'} does X while ${p.n2||'Partner B'} does Y simultaneously. Make it fun and romantic. Keep the response concise and short.`;
  const reply=await callAI([{role:'user',content:prompt}],null,true);
  var cookBtn = document.querySelector('button[onclick="getCookSug()"]');
  if(reply.startsWith('⏰')||reply.startsWith('💡')||reply.startsWith('🔑')){
    res.innerHTML=`<div class="ai-error">${reply}</div>`;
    _cookLock=false;
    if(cookBtn){cookBtn.disabled=false;cookBtn.style.opacity='1';cookBtn.style.cursor='pointer';}
    return;
  }
  // Extract ingredients for grocery list (simplified)
  const dishMatch=reply.match(/["""](.*?)["""]/);
  const dishName=dishMatch?dishMatch[1]:_cookMoodName;
  res.innerHTML=`<div style="background:rgba(255,255,255,.06);border-radius:16px;padding:16px;border:1px solid rgba(201,149,74,.2)"><div style="font-size:13px;line-height:1.9;color:rgba(255,255,255,.85)">${reply.replace(/\n/g,'<br>')}</div></div><div style="display:flex;gap:8px;margin-top:12px"><button class="btn-gold" style="padding:10px;font-size:12px;flex:1" onclick="generateGrocery('${dishName}')">${isAr?'🛒 قائمة المشتريات':'🛒 Grocery List'}</button><button class="btn-rose" style="padding:10px;font-size:12px;flex:1" onclick="startTimer()">${isAr?'⏱️ ابدأ المؤقت':'⏱️ Start Timer'}</button></div>`;
  updateCredits();hap.success();_cookLock=false;
  if(cookBtn){cookBtn.disabled=false;cookBtn.style.opacity='1';cookBtn.style.cursor='pointer';}
}

function generateGrocery(dishName){
  // Add sample ingredients based on dish name
  const sampleIngredients=[{item:'Onions & Garlic',cat:'Produce'},{item:'Olive Oil',cat:'Pantry'},{item:'Salt, Pepper & Spices',cat:'Pantry'},{item:'Main protein',cat:'Protein'},{item:'Fresh herbs',cat:'Produce'},{item:'Rice or Bread',cat:'Carbs'}];
  addGroceryItems(sampleIngredients,dishName);T(isAr?'تم إضافة المشتريات! 🛒':'Grocery list added! 🛒');hap.success();
}

function showDishes(idx){
  var cu=(window._CD||[])[idx];if(!cu)return;
  var nm=isAr?cu.a:cu.n;
  // Ensure cuisine section is expanded so dishes-sec is visible
  var cuisBody=document.getElementById('sect-cuisines');
  if(cuisBody&&cuisBody.style.display==='none') toggleCookSection('cuisines');
  var sec=document.getElementById('dishes-sec');if(!sec)return;
  if(!window._DC)window._DC={};
  sec.innerHTML='';
  var title=document.createElement('div');
  title.style.cssText='font-size:13px;font-weight:700;color:var(--text-mid);margin-bottom:10px';
  title.textContent=(isAr?'أطباق '+nm:nm+' Dishes');
  var moodHint=document.createElement('div');
  moodHint.style.cssText='font-size:12px;color:var(--text-soft);margin-bottom:12px';
  moodHint.textContent=_cookMoodName ? (isAr?'اختيارات مزاج '+_cookMoodName:'Mood picks: '+_cookMoodName) : (isAr?'اختر مزاجاً لمقترحات ألذ':'Choose a mood for better picks');

  var sorted=cu.d.slice();
  if(_cookMoodKey){
    var moodKeywords={
      romantic:['love','rose','candle','baklava','tiramisu','risotto','sushi','cream','champagne'],
      cozy:['soup','stew','curry','risotto','pasta','naan','rice','comfort','melt'],
      adventurous:['spicy','kimchi','sushi','taco','biryani','mapo','teriyaki','curry','tangy'],
      healthy:['salad','grilled','veggies','tofu','pho','tabbouleh','soup','light','fresh'],
      fancy:['truffle','tiramisu','risotto','sushi','coq','lobster','scallop','rose','champagne']
    };
    var keys=moodKeywords[_cookMoodKey]||[];
    sorted.sort(function(a,b){
      var sa=keys.reduce(function(sum,k){return sum+(a.toLowerCase().includes(k)?1:0);},0);
      var sb=keys.reduce(function(sum,k){return sum+(b.toLowerCase().includes(k)?1:0);},0);
      return sb-sa;
    });
  }
  var topPick=sorted.slice(0,5);
  var row=document.createElement('div');
  row.style.cssText='display:flex;flex-wrap:wrap;gap:6px';
  topPick.forEach(function(d,i){
    var k='c'+idx+'_'+i;
    window._DC[k]={dish:d,cuisine:nm};
    var sp=document.createElement('span');
    sp.className='chip';sp.textContent=d;
    (function(key){sp.onclick=function(){getCuisineRecipe(key);};})(k);
    row.appendChild(sp);
  });
  sec.appendChild(title);
  sec.appendChild(moodHint);
  sec.appendChild(row);
  sec.scrollIntoView({behavior:'smooth'});hap.tap();
}
async function getCuisineRecipe(key){
  if(_cookLock) return;
  _cookLock = true;
  var cached=(window._DC||{})[key];
  if(!cached){T(isAr?'خطأ، حاول مجدداً':'Error, try again');_cookLock=false;return;}
  var dish=cached.dish,cuisine=cached.cuisine;
  if(!canUse()){showPaywall();_cookLock=false;return;}
  T(isAr?'يحضر الوصفة... 🍳':'Getting recipe... 🍳');
  useCredit();
  var p=profile||{};
  var prompt=isAr
    ?('وصفة "'+dish+'" من المطبخ '+cuisine+' لـ '+(p.n1||'الشريك أ')+' و'+(p.n2||'الشريك ب')+' يطبخانها معاً. قسّم المهام بينهما. اجعلها مرحة. اجعل الرد موجزاً ومباشراً.')
    :('Recipe for "'+dish+'" ('+cuisine+') for '+(p.n1||'Partner A')+' and '+(p.n2||'Partner B')+'. Divide tasks between A and B. Keep it fun and romantic. Keep the answer concise with ingredients and task split.');
  var reply=await callAI([{role:'user',content:prompt}],null,true);
  var sh=getSheet('recipe-sh');
  var isErr=reply.startsWith('⏰')||reply.startsWith('💡')||reply.startsWith('🔑');
  var safeReply=reply.split('\n').join('<br>');
  var body=isErr?('<div class="ai-error">'+reply+'</div>'):('<div style="font-size:14px;line-height:1.9;color:var(--text)">'+safeReply+'</div>');
  var closeBtn='<button class="btn-rose" style="margin-top:16px" onclick="closeSheet(\'recipe-sh\')">'+(isAr?'حسناً 💕':'Got it! 💕')+'</button>';
  var heading='<h3 style="font-family:Georgia,serif;color:var(--rose);margin-bottom:16px;font-size:22px">🍳 '+dish+'</h3>';
  sh.querySelector('.sheet').innerHTML='<div class="sheet-handle"></div>'+heading+body+closeBtn;
  sh.classList.add('open');updateCredits();hap.success();_cookLock=false;
}

async function promptDishRecipe(dish){
  if(_cookLock) return;
  if(!canUse()){showPaywall();return;}
  _cookLock = true;
  T(isAr?'يحضر الوصفة... 🍳':'Getting recipe... 🍳');
  useCredit();
  var p=profile||{};
  var prompt=isAr
    ?('وصفة "'+dish+'" لشخصين '+(p.n1||'الشريك أ')+' و'+(p.n2||'الشريك ب')+' يطبخانها معاً. قسّم المهام واجعلها ممتعة ورومانسية. اجعل الرد قصيراً ومباشراً.')
    :('Recipe for "'+dish+'" for '+(p.n1||'Partner A')+' and '+(p.n2||'Partner B')+' to cook together. Divide tasks and keep it fun and romantic. Keep the answer short, with ingredients and a simple task split.');
  var reply=await callAI([{role:'user',content:prompt}],null,true);
  var sh=getSheet('recipe-sh');
  var isErr=reply.startsWith('⏰')||reply.startsWith('💡')||reply.startsWith('🔑');
  var safeReply=reply.split('\n').join('<br>');
  var body=isErr?('<div class="ai-error">'+reply+'</div>'):( '<div style="font-size:14px;line-height:1.9;color:var(--text)">'+safeReply+'</div>' );
  var closeBtn='<button class="btn-rose" style="margin-top:16px" onclick="closeSheet(\'recipe-sh\')">'+(isAr?'حسناً 💕':'Got it! 💕')+'</button>';
  var heading='<h3 style="font-family:Georgia,serif;color:var(--rose);margin-bottom:16px;font-size:22px">🍳 '+dish+'</h3>';
  sh.querySelector('.sheet').innerHTML='<div class="sheet-handle"></div>'+heading+body+closeBtn;
  sh.classList.add('open');updateCredits();hap.success();_cookLock=false;
}

// Timer
function startTimer(){if(_tRun)return;_tRun=true;hap.success();_tInt=setInterval(()=>{_tSecs++;const m=Math.floor(_tSecs/60),s=_tSecs%60;const d=document.getElementById('timer-disp');if(d)d.textContent=String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');if(_tSecs%120===0){_tTask=(_tTask+1)%(isAr?COOK_TASKS_AR:COOK_TASKS_EN).length;const td=document.getElementById('task-disp');if(td)td.textContent=(isAr?COOK_TASKS_AR:COOK_TASKS_EN)[_tTask];hap.success()}},1000)}
function resetTimer(){if(_tInt)clearInterval(_tInt);_tRun=false;_tSecs=0;_tTask=0;const d=document.getElementById('timer-disp');if(d)d.textContent='00:00';const td=document.getElementById('task-disp');if(td)td.textContent=(isAr?COOK_TASKS_AR:COOK_TASKS_EN)[0];hap.tap()}

// ══════════════════════════════════════════════════
//  DATES TAB
// ══════════════════════════════════════════════════
function rDates(el){
  const cats=[{id:'romantic',e:'🌹',en:'Romantic',ar:'رومانسي'},{id:'nature',e:'🌿',en:'Nature',ar:'طبيعة'},{id:'dining',e:'🍽️',en:'Dining',ar:'مطاعم'},{id:'fun',e:'🎭',en:'Fun',ar:'مرح'},{id:'family',e:'👨‍👩‍👧',en:'Family',ar:'عائلة'},{id:'luxury',e:'💎',en:'Luxury',ar:'فاخر'}];
  const places={
    romantic:[{e:'🌅',en:'Sunset Walk',ar:'مشية الغروب',de:'Find the most beautiful sunset spot — golden hour magic.',dar:'ابحثوا عن أجمل نقطة غروب.',t:'Bring blanket & snacks',ta:'بطانية وعصير'},{e:'🏖️',en:'Beach Evening',ar:'سهرة شاطئية',de:'Quiet beach after sunset — stars, waves, each other.',dar:'شاطئ هادئ بعد الغروب.',t:'Best after 8pm',ta:'بعد الساعة 8'},{e:'🌹',en:'Rooftop Dinner',ar:'عشاء على السطح',de:'Restaurant with city lights view.',dar:'مطعم بإطلالة على المدينة.',t:'Book ahead on weekends',ta:'احجزوا مسبقاً'},{e:'🏛️',en:'Heritage Stroll',ar:'تجول تراثي',de:'Old city or heritage village at night.',dar:'المنطقة التراثية ليلاً.',t:'Stop at a traditional café',ta:'كرك في مقهى تراثي'}],
    nature:[{e:'🏜️',en:'Desert Camp',ar:'تخييم صحراوي',de:'Stars above, silence around — nothing more romantic.',dar:'نجوم وصمت — لا شيء أكثر رومانسية.',t:'Book guided camp',ta:'احجزوا مع مرشد'},{e:'🌊',en:'Corniche Morning',ar:'صباح الكورنيش',de:'Early water walk — peaceful and fresh.',dar:'مشية صباحية بجانب الماء.',t:'6-7am before heat',ta:'6-7 قبل الحر'},{e:'🌳',en:'Park Picnic',ar:'نزهة في الحديقة',de:'Homemade food in a green park.',dar:'طعام منزلي في حديقة.',t:'Bring a board game',ta:'أحضروا لعبة'},{e:'⛵',en:'Dhow Cruise',ar:'رحلة ذهبية',de:'Sunset boat with dinner.',dar:'رحلة بحرية عند الغروب.',t:'Book dinner cruise',ta:'مع العشاء'}],
    dining:[{e:'🍲',en:'New Cuisine Night',ar:'تجربة مطبخ جديد',de:'Pick a cuisine neither of you has tried.',dar:'مطبخ لم تجرباه من قبل.',t:'Ethiopian or Georgian',ta:'إثيوبي أو جورجي رائع'},{e:'☕',en:'Specialty Coffee',ar:'جلسة قهوة',de:'Artisan café you\'ve never been to.',dar:'مقهى متخصص جديد.',t:'Try something new',ta:'جربوا شيئاً جديداً'},{e:'🥘',en:'Cook Together',ar:'الطبخ معاً',de:'Use the Cook tab — AI recipe + timer!',dar:'افتح تاب نطبخ!',t:'Check Cook tab',ta:'تاب نطبخ للوصفات'},{e:'🍣',en:"Chef's Table",ar:'طاولة الشيف',de:'Let the chef decide — surprising & intimate.',dar:'دعوا الشيف يفاجئكم.',t:'Great for anniversaries',ta:'مثالي للذكريات'}],
    fun:[{e:'🎨',en:'Art Class',ar:'دورة رسم',de:'Painting or pottery — no skills needed, just fun.',dar:'رسم أو فخار معاً.',t:'Check community centers',ta:'المراكز المجتمعية'},{e:'🎮',en:'Escape Room',ar:'غرفة هروب',de:'Teamwork to solve puzzles together.',dar:'حلوا الألغاز معاً.',t:'Weekdays cheaper',ta:'أيام الأسبوع أرخص'},{e:'🎬',en:'Movie Night',ar:'ليلة سينما',de:'Open-air or cozy home setup.',dar:'سينما في الهواء الطلق.',t:'Pick a genre you both love',ta:'نوع تحبونه معاً'},{e:'🛍️',en:'Market Day',ar:'يوم السوق',de:'Wander local market with a fun budget.',dar:'تجولوا بميزانية مرحة.',t:'Unexpected purchases only!',ta:'فقط المفاجآت!'}],
    family:[{e:'🏛️',en:'Museum Day',ar:'يوم المتحف',de:'Learn city history as a family.',dar:'تاريخ المدينة معاً.',t:'Free on certain days',ta:'مجاني في أيام معينة'},{e:'🎡',en:'Theme Park',ar:'مدينة ألعاب',de:'Pure joy — be kids again!',dar:'فرح خالص للعائلة.',t:'Weekdays less crowds',ta:'أيام الأسبوع أهدأ'},{e:'🌊',en:'Water Park',ar:'حديقة مائية',de:'Fun for all ages.',dar:'مرح لجميع الأعمار.',t:'Arrive early',ta:'اذهبوا مبكراً'},{e:'🏕️',en:'Family Camping',ar:'تخييم عائلي',de:'Night under stars the family will remember.',dar:'ليلة لن تُنسى.',t:'Pack games & s\'mores',ta:'ألعاب ومارشميلو'}],
    luxury:[{e:'🎈',en:'Hot Air Balloon',ar:'منطاد هواء ساخن',de:'See your world from above — bucket-list.',dar:'رؤية العالم من فوق.',t:'Book early morning',ta:'الصباح الباكر أجمل'},{e:'🏊',en:'Private Beach',ar:'شاطئ خاص',de:'Private cabana or resort beach.',dar:'كبانا أو شاطئ خاص.',t:'Day passes available',ta:'تصاريح يومية متاحة'},{e:'🌌',en:'Stargazing',ar:'مراقبة النجوم',de:'Dark area — discover the galaxy together.',dar:'مكان مظلم لاكتشاف المجرة.',t:'Use star-mapping app',ta:'تطبيق خرائط النجوم'},{e:'🏕️',en:'Glamping',ar:'تخييم فاخر',de:'Luxury tent camping — nature with romance.',dar:'طبيعة مع رفاهية.',t:'Desert glamping is magical',ta:'التخييم الصحراوي رائع'}]
  };
  el.innerHTML=`<div class="container">
  <button class="back-btn" onclick="showTab('home')">← ${isAr?'رجوع':'Back'}</button>
  <div style="margin-bottom:20px"><div style="font-size:24px;font-weight:700;font-family:'Cormorant Garamond',serif">${isAr?'أفكار للخروج 🌹':'Date Ideas 🌹'}</div><div style="font-size:14px;color:var(--text-soft)">${isAr?'خططوا شيئاً مميزاً معاً':'Plan something special together'}</div></div>
  <!-- AI PLANNER -->
  <div class="card-rose" style="padding:18px;margin-bottom:20px">
    <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:6px">✨ ${isAr?'مخطط خروجات AI':'AI Date Planner'}</div>
    <div style="font-size:13px;color:var(--text-soft);margin-bottom:12px">${isAr?'أخبرنا عن مزاجك واحصل على خطة مخصصة':'Describe your mood for a personalized date plan'}</div>
    <input id="date-vibe" placeholder="${isAr?'مثال: رومانسي، طبيعة، بسيط...':'e.g. romantic, outdoor, budget-friendly...'}" style="margin-bottom:10px">
    <button class="btn-rose" onclick="getAIDatePlan()" style="padding:12px;font-size:14px">✨ ${isAr?'خططوا ليلتنا':'Plan Our Night'}</button>
    <div id="date-plan-res" style="margin-top:12px"></div>
  </div>
  <!-- CATS -->
  <div style="overflow-x:auto;white-space:nowrap;padding-bottom:8px;margin-bottom:16px;-webkit-overflow-scrolling:touch">${cats.map((c,i)=>`<span class="chip ${i===0?'active':''}" id="dc-${c.id}" onclick="filterDates('${c.id}',this)">${c.e} ${isAr?c.ar:c.en}</span>`).join('')}</div>
  <!-- PLACES -->
  <div id="places-grid">${renderPlaces(places.romantic)}</div>
  </div>`;
  window._dp=places;
}
function renderPlaces(list){
  if(!list||!list.length)return'<div class="empty-state"><div class="empty-icon">🌹</div><div style="font-size:16px;color:var(--text-soft)">'+(isAr?'لا أفكار في هذه الفئة بعد':'No ideas in this category yet')+'</div></div>';
  return list.map(function(p){
    var nameDisplay=isAr?p.ar:p.en;
    var subName=isAr?'':'<div style="font-size:12px;color:var(--rose);margin-bottom:4px">'+p.ar+'</div>';
    var desc=isAr?p.dar:p.de;
    var tip=isAr?p.ta:p.t;
    var safeName=nameDisplay.replace(/'/g,'&#39;');
    return '<div class="place-card">'+
      '<div style="font-size:36px;min-width:48px;text-align:center">'+p.e+'</div>'+
      '<div style="flex:1">'+
        '<div style="font-weight:700;font-size:15px;color:var(--text)">'+nameDisplay+'</div>'+
        subName+
        '<div style="font-size:13px;color:var(--text-mid);margin-bottom:6px;line-height:1.5">'+desc+'</div>'+
        '<div style="font-size:12px;color:var(--text-soft);background:var(--card2);border-radius:8px;padding:6px 10px;margin-bottom:8px">💡 '+tip+'</div>'+
        '<button onclick="getAIPlacePlan(\''+safeName+'\')" style="background:none;border:1px solid var(--rose);color:var(--rose);border-radius:20px;padding:5px 14px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">'+(isAr?'خطة AI ✨':'AI Plan ✨')+'</button>'+
      '</div>'+
    '</div>';
  }).join('');
}
function filterDates(id,el){document.querySelectorAll('[id^="dc-"]').forEach(c=>c.classList.remove('active'));el.classList.add('active');const g=document.getElementById('places-grid');if(g&&window._dp&&window._dp[id])g.innerHTML=renderPlaces(window._dp[id]);hap.tap()}
async function getAIDatePlan(){
  if(_dateLock) return;
  if(!canUse()){showPaywall();return}
  _dateLock = true;
  const vibe=document.getElementById('date-vibe')?.value||'special';
  const res=document.getElementById('date-plan-res');if(!res){_dateLock=false;return;}
  res.innerHTML=`<div style="text-align:center;padding:12px"><div class="typing-dots"><span></span><span></span><span></span></div><div style="font-size:13px;color:var(--text-soft);margin-top:6px">${isAr?'يخطط... 💕':'Planning... 💕'}</div></div>`;
  useCredit();const p=profile||{};
  const reply=await callAI([{role:'user',content:isAr?`خطة خروجة رومانسية لـ ${p.n1||'الزوجين'} و${p.n2||''}. المزاج: "${vibe}". اذكر أين يذهبون، ماذا يفعلون، ماذا يحضرون، وكيف يجعلون الليلة مميزة. استخدم إيموجيز.`:`Romantic date plan for ${p.n1||'the couple'}${p.n2?' and '+p.n2:''}. Vibe: "${vibe}". Include where to go, what to do, what to bring, how to make it magical. Use emojis.`}]);
  if(reply.startsWith('⏰')||reply.startsWith('💡')||reply.startsWith('🔑')){
    res.innerHTML=`<div class="ai-error">${reply}</div>`;
    _dateLock = false;
    return;
  }
  res.innerHTML=`<div class="card" style="padding:14px;border-left:3px solid var(--rose)"><div style="font-size:13px;line-height:1.8;color:var(--text)">${reply.replace(/\n/g,'<br>')}</div></div>`;
  updateCredits();hap.success();_dateLock=false;
}
async function getAIPlacePlan(name){
  if(!canUse()){showPaywall();return}
  T(isAr?'يحضر الخطة... 💕':'Getting plan... 💕');useCredit();const p=profile||{};
  const reply=await callAI([{role:'user',content:isAr?`خطة تفصيلية لخروجة "${name}" لـ ${p.n1||'الزوجين'}${p.n2?' و'+p.n2:''}. أفضل وقت، ماذا يلبسان، ماذا يحضران، موضوعات للحديث، وكيف يجعلانها لا تُنسى.`:`Detailed date plan for "${name}" for ${p.n1||'a couple'}${p.n2?' and '+p.n2:''}. Best time, what to wear, bring, conversation topics, how to make it unforgettable.`}]);
  const sh=getSheet('dplan-sh');
  sh.querySelector('.sheet').innerHTML=`<div class="sheet-handle"></div><h3 style="font-family:'Cormorant Garamond',serif;color:var(--rose);margin-bottom:16px;font-size:22px">🌹 ${name}</h3>${reply.startsWith('⏰')?`<div class="ai-error">${reply}</div>`:`<div style="font-size:14px;line-height:1.9;color:var(--text)">${reply.replace(/\n/g,'<br>')}</div>`}<button class="btn-rose" style="margin-top:16px" onclick="saveDatePlan('${name}');closeSheet('dplan-sh')">${isAr?'💕 أضف للذكريات':'💕 Save to Memories'}</button>`;
  sh.classList.add('open');updateCredits();hap.success();
}
function saveDatePlan(name){dateHist.unshift({id:Date.now(),name,area:isAr?'محلي':'Local',ts:new Date().toISOString()});LS.set('aw_datehist',dateHist);T(isAr?'تمت الإضافة! 💕':'Saved! 💕');hap.success()}

// ══════════════════════════════════════════════════
//  MEMORIES TAB
// ══════════════════════════════════════════════════
function rMemories(el){
  const allOcc=getOccasions();
  el.innerHTML=`<div class="container">
  <button class="back-btn" onclick="showTab('home')">← ${isAr?'رجوع':'Back'}</button>
  <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:12px">
    <div><div style="font-size:24px;font-weight:700;font-family:'Cormorant Garamond',serif">${isAr?'قصتنا 📖':'Our Story 📖'}</div><div style="font-size:14px;color:var(--text-soft)">${isAr?'ذكرياتنا ومناسباتنا':'Memories & occasions'}</div></div>
    <button onclick="openAddMemory()" class="btn-rose" style="width:auto;padding:10px 18px;font-size:14px">+ ${isAr?'أضف':'Add'}</button>
  </div>
  <div style="background:rgba(201,149,74,.08);border:1px solid rgba(201,149,74,.2);border-radius:12px;padding:10px 14px;margin-bottom:16px;font-size:12px;color:var(--gold);line-height:1.6">
    💾 ${isAr?'بياناتكما محفوظة على هذا الجهاز. احرصا على عدم مسح ذاكرة المتصفح. صدّرا نسخة احتياطية من الملف الشخصي.':'Your data is saved on this device only. Avoid clearing browser storage. Export a backup from Profile.'}
  </div>
  <!-- OCCASIONS -->
  <div style="margin-bottom:20px">
    <div style="font-size:14px;font-weight:700;color:var(--text-mid);margin-bottom:12px">⏰ ${isAr?'المناسبات القادمة':'Upcoming Occasions'} <button onclick="openAddOcc()" style="float:right;background:none;border:none;color:var(--rose);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">+ ${isAr?'أضف':'Add'}</button></div>
    ${allOcc.length>0?allOcc.map(o=>`<div class="countdown-card ${o.d<=7?'urgent':''}"><div class="countdown-days">${o.d}</div><div style="flex:1"><div style="font-weight:700;color:var(--text);font-size:14px">${o.em} ${o.n}</div><div style="font-size:12px;color:var(--text-soft)">${o.d===0?(isAr?'🎉 اليوم!':'🎉 Today!'):o.d===1?(isAr?'غداً!':'Tomorrow!'):(isAr?'يوم متبقٍ':'days left')}</div><div style="font-size:11px;color:var(--text-soft)">${o.dateStr}</div></div>${o.d<=30?`<button onclick="getOccIdea('${o.n}',${o.d})" style="background:var(--rose-glow);border:1px solid rgba(232,132,154,.3);color:var(--rose);border-radius:10px;padding:6px 10px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">${isAr?'أفكار AI ✨':'AI Ideas ✨'}</button>`:''}</div>`).join(''):`<div class="empty-state" style="padding:20px"><div style="font-size:40px;margin-bottom:10px">📅</div><div style="font-size:14px;color:var(--text-soft)">${isAr?'لا مناسبات بعد. أضف ذكرى زواجكما! 💍':'No occasions yet. Add your anniversary! 💍'}</div></div>`}
  </div>
  <!-- DATE ADVENTURES -->
  ${dateHist.length>0?`<div style="margin-bottom:20px"><div style="font-size:14px;font-weight:700;color:var(--text-mid);margin-bottom:12px">📍 ${isAr?'مغامراتنا':'Our Adventures'}</div>${dateHistHTML()}</div>`:''}
  <!-- MEMORIES with Timeline toggle -->
  <div style="margin-bottom:16px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <div style="font-size:14px;font-weight:700;color:var(--text-mid)">💕 ${isAr?'ذكرياتنا':'Our Memories'}</div>
      <div style="display:flex;gap:6px">
        <button id="mem-view-grid" onclick="setMemView('grid')" style="background:var(--rose-glow);border:1px solid var(--rose-light);color:var(--rose);border-radius:8px;padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">☰ ${isAr?'قائمة':'List'}</button>
        <button id="mem-view-timeline" onclick="setMemView('timeline')" style="background:none;border:1px solid var(--border);color:var(--text-soft);border-radius:8px;padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">⏱ ${isAr?'الجدول':'Timeline'}</button>
      </div>
    </div>
    <div id="mem-content">
    ${memories.length>0?renderMemoriesGrid(memories):emptyStateV2('📖',isAr?'قصتنا لم تُكتب بعد':'A Story Waiting to Begin',isAr?'كل مغامرة تبدأ بلحظة واحدة. أضف ذكرتكم الأولى.':'Every great adventure starts with a single moment. Add your first memory.',isAr?'أضف ذكرى 💕':'Add Memory 💕','openAddMemory()')}
    </div>
  </div>
  </div>`;
}
function renderMemoriesGrid(mems) {
  return mems.slice().reverse().map(function(m){
    return '<div style="display:flex;gap:14px;margin-bottom:20px;animation:fadeUp .4s ease">' +
      '<div style="display:flex;flex-direction:column;align-items:center">' +
        '<div class="memory-dot"></div>' +
        '<div class="memory-connector"></div>' +
      '</div>' +
      '<div style="flex:1;padding-bottom:16px">' +
        '<div style="font-size:11px;color:var(--rose);font-weight:700;margin-bottom:4px">'+m.date+' · '+(m.em||'💕')+'</div>' +
        '<div class="memory-content">' +
          '<div style="font-weight:700;font-size:15px;color:var(--text);margin-bottom:4px">'+esc(m.title)+'</div>' +
          (m.note?'<div style="font-size:13px;color:var(--text-mid);line-height:1.6">'+esc(m.note)+'</div>':'') +
        '</div>' +
        '<button onclick="delMemory(\''+m.id+'\')" style="background:none;border:none;color:var(--text-soft);font-size:12px;cursor:pointer">🗑 '+(isAr?'حذف':'Delete')+'</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

function renderMemoriesTimeline(mems) {
  if(!mems.length) return emptyStateV2('📖',isAr?'قصتنا لم تُكتب بعد':'A Story Waiting to Begin',isAr?'أضف أول ذكرى':'Add your first memory',isAr?'أضف ذكرى 💕':'Add Memory 💕','openAddMemory()');
  var sorted = mems.slice().sort(function(a,b){ return new Date(a.date) - new Date(b.date); });
  var byYear = {};
  sorted.forEach(function(m){
    var yr = (m.date||'').slice(0,4) || '?';
    if(!byYear[yr]) byYear[yr] = [];
    byYear[yr].push(m);
  });
  var html = '';
  Object.keys(byYear).sort().forEach(function(yr){
    html += '<div style="text-align:center;margin:16px 0 12px"><span style="background:linear-gradient(135deg,var(--rose),var(--gold));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;font-family:\'Cormorant Garamond\',serif;font-size:22px;font-weight:700">'+yr+'</span></div>';
    byYear[yr].forEach(function(m){
      html += '<div class="timeline-item" style="position:relative">' +
        '<div style="position:relative"><div class="timeline-dot">'+(m.em||'💕')+'</div></div>' +
        '<div class="timeline-body">' +
          '<div style="font-size:11px;color:var(--rose);font-weight:700;margin-bottom:4px">'+m.date+'</div>' +
          '<div style="font-weight:700;font-size:15px;color:var(--text);margin-bottom:4px">'+esc(m.title)+'</div>' +
          (m.note?'<div style="font-size:13px;color:var(--text-mid);line-height:1.6">'+esc(m.note)+'</div>':'') +
        '</div>' +
      '</div>';
    });
  });
  return html;
}

var _memView = 'grid';
function setMemView(view) {
  _memView = view;
  var content = document.getElementById('mem-content');
  var gridBtn = document.getElementById('mem-view-grid');
  var tlBtn = document.getElementById('mem-view-timeline');
  if(gridBtn) {
    gridBtn.style.background = view==='grid' ? 'var(--rose-glow)' : 'none';
    gridBtn.style.borderColor = view==='grid' ? 'var(--rose-light)' : 'var(--border)';
    gridBtn.style.color = view==='grid' ? 'var(--rose)' : 'var(--text-soft)';
  }
  if(tlBtn) {
    tlBtn.style.background = view==='timeline' ? 'rgba(201,149,74,.1)' : 'none';
    tlBtn.style.borderColor = view==='timeline' ? 'var(--gold)' : 'var(--border)';
    tlBtn.style.color = view==='timeline' ? 'var(--gold)' : 'var(--text-soft)';
  }
  if(content) {
    content.style.opacity = '0';
    content.style.transition = 'opacity .2s';
    setTimeout(function(){
      content.innerHTML = view==='timeline' ? renderMemoriesTimeline(memories) : (memories.length ? renderMemoriesGrid(memories) : emptyStateV2('📖',isAr?'قصتنا لم تُكتب بعد':'A Story Waiting to Begin',isAr?'أضف أول ذكرى':'Add your first memory',isAr?'أضف ذكرى 💕':'Add Memory 💕','openAddMemory()'));
      content.style.opacity = '1';
    }, 200);
  }
  hap.tap();
}

function dateHistHTML(){
  return dateHist.slice(0,10).map(d=>{
    const dt=new Date(d.ts),fmt=dt.toLocaleDateString('en-GB',{day:'numeric',month:'short'});
    return`<div class="date-hist-item"><div class="date-hist-icon">${d.photo?`<img src="${d.photo}" style="width:100%;height:100%;object-fit:cover"/>`:'📍'}</div><div style="flex:1"><div style="font-size:14px;font-weight:600;color:var(--text)">${d.name}</div><div style="font-size:11px;color:var(--text-mid)">${d.area} · ${fmt}</div>${!d.photo?`<button class="upload-btn" onclick="triggerPhoto(${d.id})">${isAr?'📸 أضف صورة':'📸 Add Photo'}</button><input type="file" id="fi-${d.id}" class="hidden-file" accept="image/*" onchange="handlePhoto(event,${d.id})">`:''}</div><span style="color:var(--rose);font-size:16px">❤️</span></div>`;
  }).join('');
}
function triggerPhoto(id){const i=document.getElementById('fi-'+id);if(i)i.click();hap.tap()}
function handlePhoto(e,id){
  const f=e.target.files[0];if(!f)return;
  const r=new FileReader();
  r.onload=ev=>{const img=new Image();img.onload=()=>{const c=document.createElement('canvas');const M=400;const sc=M/img.width;c.width=M;c.height=img.height*sc;c.getContext('2d').drawImage(img,0,0,c.width,c.height);savePhoto(id,c.toDataURL('image/jpeg',.65))};img.src=ev.target.result};r.readAsDataURL(f);
}
function savePhoto(id,data){const idx=dateHist.findIndex(d=>d.id===id);if(idx!==-1){dateHist[idx].photo=data;LS.set('aw_datehist',dateHist);hap.success();showTab('memories')}}

// ══════════════════════════════════════════════════
//  PROFILE TAB
// ══════════════════════════════════════════════════
function rProfile(el){
  const p=profile||{};const streak=getStreak();const chatCount=LS.get('aw_chat',[]).length;
  let days=0;if(p.ann)days=Math.floor((Date.now()-new Date(p.ann))/864e5);
  const gratDays=gratState.days||[];const h7=gratDays.length>=7;const h30=streak>=30;const h10=memories.length>=10;
  const partnerCode=LS.get('aw_partner_code','');
  const partnerName=LS.get('aw_partner_name',isAr?'شريكك':'Partner');
  const isOnline=Date.now()-LS.get('aw_partner_last_active',0)<120000; // 2 min
  const coupleCard = partnerCode ? `
  <div class="card" style="padding:20px;margin-bottom:20px;background:linear-gradient(135deg,rgba(201,149,74,.08),rgba(232,132,154,.06));border:1px solid rgba(201,149,74,.25);text-align:center">
    <div style="font-size:11px;font-weight:800;color:var(--gold-light);text-transform:uppercase;letter-spacing:.12em;margin-bottom:12px">${isAr?'عالمنا المشترك':'Our Shared World'}</div>
    <div style="display:flex;justify-content:center;align-items:center;gap:12px;margin-bottom:14px">
      <div style="text-align:center">
        <div style="width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,var(--rose),var(--rose-deep));display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;color:#fff;font-family:'Cormorant Garamond',serif;margin:0 auto 4px">${(p.n1||'A')[0].toUpperCase()}</div>
        <div style="font-size:11px;font-weight:700;color:var(--text)">${p.n1||'You'}</div>
        <div style="font-size:9px;color:#4CAF50;font-weight:700">● ${isAr?'أنت':'You'}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:center;gap:4px">
        <div style="font-size:20px">💕</div>
        <div style="font-size:10px;color:${isOnline?'#4CAF50':'var(--text-soft)'};font-weight:700">${isOnline?(isAr?'متصل':'Online'):(isAr?'آخر ظهور':'Seen recently')}</div>
      </div>
      <div style="text-align:center">
        <div style="width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,#C9954A,#A07030);display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;color:#fff;font-family:'Cormorant Garamond',serif;margin:0 auto 4px">${(partnerName||'B')[0].toUpperCase()}</div>
        <div style="font-size:11px;font-weight:700;color:var(--text)">${partnerName}</div>
        <div style="font-size:9px;color:${isOnline?'#4CAF50':'var(--text-soft)'};font-weight:700">● ${isOnline?(isAr?'متصل':'Online'):(isAr?'غير متصل':'Offline')}</div>
      </div>
    </div>
    <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-bottom:12px">
      <span style="background:rgba(232,132,154,.12);color:var(--rose);border:1px solid rgba(232,132,154,.25);padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700">🔥 ${streak} ${isAr?'يوم':'days'}</span>
      <span style="background:rgba(201,149,74,.12);color:var(--gold);border:1px solid rgba(201,149,74,.25);padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700">📖 ${memories.length} ${isAr?'ذكريات':'memories'}</span>
      ${days>0?`<span style="background:rgba(201,149,74,.12);color:var(--gold);border:1px solid rgba(201,149,74,.25);padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700">💍 ${days} ${isAr?'يوم':'days'}</span>`:''}
    </div>
    <button onclick="openChatSheet()" class="btn-rose" style="padding:10px 20px;font-size:13px;font-weight:700">${isAr?'💬 محادثة الآن':'💬 Chat Now'}</button>
  </div>` : `
  <div class="card" style="padding:20px;margin-bottom:20px;border:1px dashed rgba(201,149,74,.3);text-align:center">
    <div style="font-size:32px;margin-bottom:8px">🔗</div>
    <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:6px">${isAr?'ابنوا عالماً مشتركاً':'Build a shared world'}</div>
    <div style="font-size:12px;color:var(--text-soft);margin-bottom:12px">${isAr?'اربط حساب شريكك لمزامنة الذكريات والمناسبات فوراً':'Link your partner\'s code to sync memories and occasions in real time'}</div>
    <button onclick="document.getElementById('partner-code-inp')?.focus();document.getElementById('partner-code-inp')?.scrollIntoView({behavior:\'smooth\'})" class="btn-gold" style="padding:10px 20px;font-size:13px">${isAr?'ربط الآن':'Link Now'}</button>
  </div>`;
  el.innerHTML=`<div class="container">
  <button class="back-btn" onclick="showTab('home')">← ${isAr?'رجوع':'Back'}</button>
  ${coupleCard}
  <!-- HERO -->
  <div class="card-rose" style="padding:24px;text-align:center;margin-bottom:20px">
    <div style="display:flex;justify-content:center;align-items:center;gap:16px;margin-bottom:16px">
      <div style="width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,var(--rose),var(--rose-deep));display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;color:#fff;font-family:'Cormorant Garamond',serif">${(p.n1||'A')[0].toUpperCase()}</div>
      <svg width="32" height="22" viewBox="0 0 200 140"><defs><linearGradient id="pg1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#F0CC70"/><stop offset="100%" stop-color="#C9954A"/></linearGradient><linearGradient id="pg2" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#E8849A"/><stop offset="100%" stop-color="#C8607A"/></linearGradient></defs><ellipse cx="75" cy="70" rx="52" ry="52" stroke="url(#pg1)" stroke-width="16" fill="none"/><ellipse cx="125" cy="70" rx="52" ry="52" stroke="url(#pg2)" stroke-width="16" fill="none"/></svg>
      <div style="width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,var(--sage),#4A8B6A);display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;color:#fff;font-family:'Cormorant Garamond',serif">${(p.n2||'B')[0].toUpperCase()}</div>
    </div>
    <div style="font-size:22px;font-weight:700;font-family:'Cormorant Garamond',serif;color:var(--text);margin-bottom:8px">${p.n1||''} & ${p.n2||''}</div>
    <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><span style="background:var(--rose-glow);color:var(--rose);border:1px solid rgba(232,132,154,.3);padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700">${p.fam||'Couple'}</span>${p.ann?`<span style="background:rgba(201,149,74,.12);color:var(--gold);border:1px solid rgba(201,149,74,.3);padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700">💍 ${days} ${isAr?'يوم':'days'}</span>`:''}</div>
    <div style="font-size:12px;color:var(--text-soft);line-height:1.6;margin-top:12px">💾 ${isAr?'بياناتكما تبقى على هذا الجهاز فقط. لا تخرج إلا عند التصدير اليدوي.':'Your data stays on this device only. It only leaves when you export manually.'}</div>
    ${p.guest?`<div style="margin-top:10px;font-size:12px;color:var(--text-soft)">${isAr?'وضع الضيف':'Guest mode'} <button onclick="doSignOut()" style="background:none;border:none;color:var(--rose);font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">${isAr?'سجل الآن':'Register'}</button></div>`:''}
  </div>
  <!-- STATS -->
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:20px">
    ${[['🔥',streak,isAr?'أيام':'Streak'],['💬',chatCount,isAr?'رسائل':'Messages'],['📖',memories.length,isAr?'ذكريات':'Memories']].map(([e,v,l])=>`<div class="card" style="padding:14px;text-align:center"><div style="font-size:20px">${e}</div><div style="font-size:24px;font-weight:800;color:var(--rose)">${v}</div><div style="font-size:10px;color:var(--text-soft)">${l}</div></div>`).join('')}
  </div>
  <!-- 7-DAY CHALLENGE -->
  <div class="card-rose" style="padding:18px;margin-bottom:16px">
    <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:6px">🤝 ${isAr?'تحدي الوفاق 7 أيام':'7-Day Harmony Challenge'}</div>
    <div style="font-size:12px;color:var(--text-soft);margin-bottom:12px">${isAr?'اكتبوا 3 أشياء تحبونها في بعضكم كل يوم':'Write 3 things you love about each other daily'}</div>
    <div style="display:flex;gap:6px;margin-bottom:10px">${[1,2,3,4,5,6,7].map(d=>`<div style="flex:1;height:8px;border-radius:4px;background:${gratDays.includes(d)?'var(--rose)':'var(--border)'};transition:background .3s;box-shadow:${gratDays.includes(d)?'0 0 6px rgba(232,132,154,.4)':'none'}"></div>`).join('')}</div>
    <div style="font-size:12px;color:var(--rose);font-weight:700;margin-bottom:12px">${gratDays.length}/7 ${isAr?'أيام مكتملة':'days complete'}</div>
    ${h7?`<div style="background:rgba(232,132,154,.1);border-radius:12px;padding:14px;text-align:center"><div style="font-size:24px;margin-bottom:4px">🎉</div><div style="font-size:13px;font-weight:700;color:var(--rose)">${isAr?'أتممتما التحدي!':'Challenge Complete!'}</div><button onclick="document.getElementById('ach-overlay').classList.add('open');hap.celebrate()" style="background:none;border:none;color:var(--gold);font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;margin-top:8px">${isAr?'عرض الوسام ✨':'View Badge ✨'}</button></div>`:`<button onclick="openGrat()" class="btn-rose" style="padding:10px;font-size:13px">${isAr?'✍️ اكتب إدخال اليوم':'✍️ Write Today\'s Entry'}</button>`}
  </div>
  <!-- QUIZ -->
  <div class="card-gold tap" onclick="openQuiz()" style="padding:16px;margin-bottom:16px;display:flex;gap:14px;align-items:center">
    <div style="font-size:32px">🎮</div><div style="flex:1"><div style="font-weight:700;font-size:14px;color:var(--gold)">${isAr?'اختبار الأزواج':'Couples Quiz'}</div><div style="font-size:12px;color:var(--text-soft);margin-top:2px">${isAr?'كم تعرفان بعض؟ · لغة الحب · محادثات عميقة':'Partner quiz · Love language · Deep convos'}</div></div><div style="font-size:20px;color:var(--gold)">→</div>
  </div>
  <!-- SECRET LANGUAGE -->
  <div class="card" style="padding:18px;margin-bottom:16px">
    <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:6px">🔒 ${isAr?'لغتنا السرية':'Secret Language'}</div>
    <div style="font-size:12px;color:var(--text-soft);margin-bottom:12px">${isAr?'حدد معنى خاص لكل إيموجي — رسائل خاصة بينكما فقط':'Give emojis your private meanings'}</div>
    <div id="secret-lang-list">${renderSecretLang()}</div>
    <button onclick="addSecretEntry()" style="background:none;border:1px dashed var(--rose);color:var(--rose);border-radius:12px;padding:8px 16px;font-size:12px;font-weight:600;cursor:pointer;width:100%;margin-top:4px;font-family:inherit">+ ${isAr?'أضف إيموجي جديد':'Add New Emoji'}</button>
    <p style="font-size:10px;color:var(--text-soft);text-align:center;margin-top:8px">${isAr?'هذه المعاني خاصة بكما فقط':'These meanings are private to your shared space'}</p>
  </div>
  <!-- BADGES -->
  <div class="card" style="padding:18px;margin-bottom:16px">
    <h3 style="margin:0 0 12px;font-family:'Cormorant Garamond',serif;color:var(--rose-deep);font-size:18px">${isAr?'الأوسمة والإنجازات':'Badges & Achievements'}</h3>
    <div class="ach-grid">
      <div class="badge-slot ${h7?'unlocked':''}"><div class="badge-icon ${h7?'gleaming':''}">🤝</div><div class="badge-label">${isAr?'خريج الوفاق':'Harmony Graduate'}</div></div>
      <div class="badge-slot ${h30?'unlocked':''}"><div class="badge-icon" style="${!h30?'background:var(--border)':''}">${h30?'🔥':'🔒'}</div><div class="badge-label">${isAr?'بطل الاستمرارية':'Streak Hero'}</div></div>
      <div class="badge-slot ${h10?'unlocked':''}"><div class="badge-icon" style="${!h10?'background:var(--border)':''}">${h10?'📖':'🔒'}</div><div class="badge-label">${isAr?'حافظ الذكريات':'Memory Keeper'}</div></div>
    </div>
    <div style="margin-top:12px;font-size:11px;color:var(--text-soft);text-align:center">${isAr?'أكمل التحدي لوسام الوفاق · 30 يوم لوسام البطل · 10 ذكريات لوسام الحافظ':'Complete challenge · 30-day streak · 10 memories'}</div>
  </div>
  <!-- PARTNER CODE -->
  <div class="card" style="padding:20px;margin-bottom:16px;border:1px solid rgba(201,149,74,.25)">
    <div style="font-size:11px;font-weight:800;color:var(--gold-light);text-transform:uppercase;letter-spacing:.12em;margin-bottom:12px">🔗 ${isAr?'كود الشريك':'Partner Code'}</div>
    <div style="font-size:12px;color:var(--text-soft);margin-bottom:14px;line-height:1.6">${isAr?'شارك كودك مع شريكك — تُزامن المناسبات والمحادثة والرموز السرية فوراً':'Share with your partner — syncs occasions, chat & secret language instantly'}</div>
    <div style="font-size:11px;font-weight:700;color:var(--text-soft);margin-bottom:8px">${isAr?'كودك الخاص:':'Your unique code:'}</div>
    <div onclick="copyCode()" style="background:linear-gradient(135deg,rgba(201,149,74,.12),rgba(232,132,154,.08));border:2px solid rgba(201,149,74,.35);border-radius:16px;padding:18px;text-align:center;cursor:pointer;margin-bottom:12px">
      <div style="font-size:32px;font-weight:800;color:var(--gold);letter-spacing:8px;font-family:'Cormorant Garamond',serif">${getCode()}</div>
      <div style="font-size:11px;color:var(--text-soft);margin-top:6px">${isAr?'اضغط للنسخ 📋':'Tap to copy 📋'}</div>
    </div>
    <button onclick="copyCode()" class="btn-gold" style="padding:12px;font-size:13px;margin-bottom:16px;width:100%">${isAr?'📋 نسخ الكود':'📋 Copy My Code'}</button>
    <div style="border-top:1px solid var(--border);padding-top:14px">
      <div style="font-size:11px;font-weight:700;color:var(--text-soft);margin-bottom:10px">${isAr?'أدخل كود شريكك للربط:':'Enter your partner\'s code to link:'}</div>
      ${LS.get('aw_partner_code','')?
        `<div style="background:rgba(232,132,154,.08);border:1.5px solid rgba(232,132,154,.3);border-radius:14px;padding:14px 16px;display:flex;align-items:center;gap:10px;margin-bottom:10px">
          <div style="flex:1">
            <div style="font-size:11px;color:var(--text-soft);margin-bottom:4px">${isAr?'كود شريكك:':'Partner code:'}</div>
            <div style="font-size:20px;font-weight:800;color:var(--rose);letter-spacing:4px">${LS.get('aw_partner_code','')}</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:18px">🔄</div>
            <div style="font-size:10px;color:#4CAF50;font-weight:700">${isAr?'متزامن':'Synced'}</div>
          </div>
        </div>
        <button onclick="unlinkPartner()" style="background:none;border:1px solid rgba(232,132,154,.3);color:var(--rose);border-radius:12px;padding:10px 16px;font-size:13px;font-weight:600;cursor:pointer;width:100%;font-family:inherit">${isAr?'إلغاء الربط':'Unlink Partner'}</button>`:
        `<div style="display:flex;gap:8px">
          <input id="partner-code-inp" placeholder="${isAr?'الكود هنا…':'Code here…'}" maxlength="8" style="flex:1;background:var(--card2);border:1.5px solid var(--border);border-radius:14px;padding:12px 14px;font-size:16px;font-family:inherit;color:var(--text);letter-spacing:4px;text-transform:uppercase;font-weight:700" oninput="this.value=this.value.toUpperCase()">
          <button onclick="linkPartner()" class="btn-rose" style="padding:12px 18px;font-size:14px;font-weight:800;white-space:nowrap">${isAr?'ربط':'Link'}</button>
        </div>
        <div style="font-size:11px;color:var(--text-soft);text-align:center;margin-top:8px">${isAr?'اطلب من شريكك مشاركة كوده من نفس التطبيق':'Ask your partner to share their code from the same app'}</div>`
      }
    </div>
  </div>
  <!-- THEME -->
  <div class="card" style="padding:16px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center">
    <div><div style="font-weight:700;font-size:14px">🌙 ${isAr?'الوضع الداكن':'Dark Mode'}</div><div style="font-size:12px;color:var(--text-soft)">${isAr?'تبديل المظهر':'Switch theme'}</div></div>
    <button onclick="toggleTheme()" id="theme-btn2" style="background:var(--rose-glow);border:1px solid rgba(232,132,154,.3);color:var(--rose);border-radius:20px;padding:8px 16px;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit">${LS.get('aw_theme','light')==='dark'?'🌙':'☀️'}</button>
  </div>
  <div class="card" style="padding:16px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center">
    <div><div style="font-weight:700;font-size:14px">🔔 ${isAr?'تذكيرات المناسبات':'Occasion Reminders'}</div><div style="font-size:12px;color:var(--text-soft)">${isAr?'فعل الإشعارات لتذكيرك باقتراب المناسبات':'Enable notifications for upcoming occasion reminders'}</div></div>
    <button onclick="requestNotifications()" style="background:var(--rose);color:#fff;border:none;border-radius:20px;padding:8px 16px;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit">${isAr?'فعل':'Enable'}</button>
  </div>
  <!-- BIOMETRIC LOCK -->
  <div class="card" style="padding:16px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center">
    <div><div style="font-weight:700;font-size:14px">🔐 ${isAr?'القفل البيومتري':'Biometric Lock'}</div><div style="font-size:12px;color:var(--text-soft)">${isAr?'FaceID / بصمة الإصبع':'FaceID / Fingerprint'}</div></div>
    <button onclick="toggleBioLock()" style="background:${LS.get('aw_bio_enabled',false)?'var(--rose-glow)':'var(--card2)'};border:1.5px solid ${LS.get('aw_bio_enabled',false)?'var(--rose)':'var(--border)'};color:${LS.get('aw_bio_enabled',false)?'var(--rose)':'var(--text-soft)'};border-radius:20px;padding:8px 16px;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit">${LS.get('aw_bio_enabled',false)?(isAr?'🔐 مفعّل':'🔐 On'):(isAr?'تفعيل':'Enable')}</button>
  </div>
  <!-- EXPORT -->
  <div class="card" style="padding:16px;margin-bottom:16px">
    <div style="font-weight:700;font-size:14px;color:var(--text);margin-bottom:4px">📥 ${isAr?'تصدير البيانات':'Export Data'}</div>
    <div style="font-size:12px;color:var(--text-soft);margin-bottom:10px">${isAr?'احفظ نسخة من كل بياناتك':'Download a backup of all your data'}</div>
    <button onclick="exportData()" class="btn-outline-gold">${isAr?'تصدير العالم (.json) 📥':'Export My World (.json) 📥'}</button>
  </div>
  <!-- PRO -->
  <div class="card-gold" style="padding:20px;margin-bottom:16px;text-align:center">
    <svg width="60" height="40" viewBox="0 0 200 140" class="float" style="margin-bottom:12px"><defs><linearGradient id="pgl1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#F0CC70"/><stop offset="100%" stop-color="#C9954A"/></linearGradient><linearGradient id="pgl2" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#E8849A"/><stop offset="100%" stop-color="#C8607A"/></linearGradient></defs><ellipse cx="75" cy="70" rx="52" ry="52" stroke="url(#pgl1)" stroke-width="16" fill="none"/><ellipse cx="125" cy="70" rx="52" ry="52" stroke="url(#pgl2)" stroke-width="16" fill="none"/></svg>
    <div style="font-family:'Cormorant Garamond',serif;font-size:24px;font-weight:700;color:var(--gold);margin-bottom:4px">أنا وياك Pro</div>
    <div style="font-size:13px;color:var(--text-soft);margin-bottom:14px;line-height:1.6">${isAr?'رسائل غير محدودة · وصفات · أفكار خروجات · ميزات حصرية':'Unlimited messages · Recipes · Date plans · Exclusive features'}</div>
    <div style="font-size:28px;font-weight:800;color:var(--gold);margin-bottom:6px">${isAr?'29 درهم':'AED 29'} <span style="font-size:14px;font-weight:400;color:var(--text-soft)">/${isAr?'شهر':'month'}</span></div>
    <div style="font-size:12px;color:var(--text-soft);margin-bottom:14px">${isAr?'أو 290 درهم/سنة · تجربة مجانية 7 أيام':'or AED 290/year · 7-day free trial'}</div>
    ${isPro()?
      `<div style="background:rgba(201,149,74,.15);border:1px solid rgba(201,149,74,.3);border-radius:50px;padding:14px;font-size:15px;font-weight:700;color:var(--gold);text-align:center">✨ ${isAr?'Pro مفعّل':'Pro Active'}</div>`:
      `<button onclick="openPaddleCheckout(PADDLE_MONTHLY_PRICE)" class="btn-gold" style="display:block;width:100%;margin-bottom:10px;cursor:pointer;font-family:inherit;font-size:15px;padding:14px;border-radius:50px;border:none">${isAr?'ابدأ تجربتك المجانية 7 أيام 🚀':'Start 7-Day Free Trial 🚀'}</button>
      <button onclick="openPaddleCheckout(PADDLE_ANNUAL_PRICE)" style="display:block;width:100%;background:none;border:1px solid var(--gold);color:var(--gold);border-radius:50px;padding:12px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">${isAr?'السنوي 290 درهم — الأفضل قيمة 💛':'Annual AED 290 — Best Value 💛'}</button>`
    }
  </div>
  <button onclick="shareApp()" class="btn-ghost" style="margin-bottom:12px">${isAr?'📤 شارك أنا وياك':'📤 Share Ana Wyak'}</button>
  <!-- CONTACT US -->
  <div class="card" style="padding:16px;margin-bottom:12px;display:flex;align-items:center;gap:14px;cursor:pointer" onclick="showContactModal()">
    <div style="font-size:28px">💌</div>
    <div style="flex:1">
      <div style="font-weight:700;font-size:14px;color:var(--text)">${isAr?'تواصل معنا':'Contact Us'}</div>
      <div style="font-size:12px;color:var(--text-soft)">support@anawyak.app</div>
    </div>
    <div style="color:var(--rose);font-size:18px">→</div>
  </div>
  <!-- ADMIN MODE TOGGLE (invisible to regular users) -->
  ${isAdmin()?
    `<div class="card-gold" style="padding:14px 16px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center">
      <div><div style="font-weight:700;font-size:13px;color:var(--gold)">👑 Admin Mode — Founder</div>
      <div style="font-size:11px;color:var(--text-soft)">∞ رسائل · وصول غير محدود · بدون paywall</div></div>
      <button onclick="if(confirm('Deactivate admin mode?')){LS.set('aw_admin','');showTab('profile')}" style="background:rgba(201,149,74,.15);border:1px solid rgba(201,149,74,.3);color:var(--gold);border-radius:10px;padding:4px 12px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">إيقاف</button>
    </div>`:
    `<div style="margin-bottom:12px">
      <button onclick="activateAdmin()" style="width:100%;background:none;border:1px dashed rgba(201,149,74,.2);color:rgba(201,149,74,.4);border-radius:12px;padding:8px;font-size:11px;cursor:pointer;font-family:inherit">${isAr?'· · ·':'· · ·'}</button>
    </div>`
  }
  <button onclick="doSignOut()" style="width:100%;background:none;border:none;color:var(--rose);font-size:13px;cursor:pointer;padding:8px;font-family:inherit;font-weight:600">${isAr?'تسجيل الخروج':'Sign Out'}</button>
  <button onclick="if(confirm(isAr?'مسح كل البيانات؟':'Reset ALL data?'))localStorage.clear(),location.reload()" style="width:100%;background:none;border:none;color:var(--text-soft);font-size:12px;cursor:pointer;padding:4px;font-family:inherit">${isAr?'مسح جميع البيانات':'Reset all data'}</button>
  <div style="text-align:center;margin-top:16px;padding-bottom:8px;font-size:11px;color:var(--text-soft);line-height:2">
    © 2026 أنا وياك · Ana Wyak<br>
    <a href="privacy.html" style="color:var(--rose);text-decoration:none;font-size:11px">${isAr?'سياسة الخصوصية':'Privacy Policy'}</a> ·
    <a href="terms.html" style="color:var(--rose);text-decoration:none;font-size:11px">${isAr?'الشروط':'Terms'}</a> ·
    <a href="pricing.html" style="color:var(--rose);text-decoration:none;font-size:11px">${isAr?'الأسعار':'Pricing'}</a> ·
    <a href="refund.html" style="color:var(--rose);text-decoration:none;font-size:11px">${isAr?'الاسترداد':'Refunds'}</a>
  </div>
  </div>`;
  const an=document.getElementById('ach-names');if(an&&profile)an.textContent=(profile.n1||'')+(profile.n2?' & '+profile.n2:'');
}

// SECRET LANGUAGE
function renderSecretLang(){return secretLang.map((s,i)=>`<div class="secret-entry"><div class="emoji-circle">${s.emoji}</div><input class="secret-input" value="${s.meaning}" placeholder="${isAr?'معنى خاص...':'Secret meaning...'}" onchange="updateSecret(${i},this.value)"></div>`).join('')}
function updateSecret(i,val){secretLang[i].meaning=val;saveSecretLang();hap.tap()}
function addSecretEntry(){const sh=getSheet('secret-add-sh');sh.querySelector('.sheet').innerHTML=`<div class="sheet-handle"></div><h3 style="font-family:'Cormorant Garamond',serif;color:var(--rose);margin-bottom:16px">${isAr?'إضافة إيموجي سري':'Add Secret Emoji'}</h3><div style="margin-bottom:14px"><label class="label">${isAr?'الإيموجي':'Emoji'}</label><input id="se-emoji" placeholder="🌟" style="text-align:center;font-size:28px;margin-bottom:12px" maxlength="2"></div><div style="margin-bottom:20px"><label class="label">${isAr?'المعنى السري':'Secret Meaning'}</label><input id="se-meaning" placeholder="${isAr?'معنى خاص...':'Secret meaning...'}"></div><button class="btn-rose" onclick="saveNewSecret()">${isAr?'إضافة 🔒':'Add 🔒'}</button>`;sh.classList.add('open');hap.tap()}
function saveNewSecret(){const e=document.getElementById('se-emoji')?.value;const m=document.getElementById('se-meaning')?.value;if(!e||!m){T(isAr?'أكمل الحقول':'Fill all fields');return}secretLang.push({emoji:e,meaning:m});saveSecretLang();closeSheet('secret-add-sh');hap.success();T(isAr?'تمت الإضافة! 🔒':'Added! 🔒');showTab('profile')}

// ══════════════════════════════════════════════════
//  QUIZ SYSTEM
// ══════════════════════════════════════════════════
const QS_EN=[{q:"Your partner's favourite food?",o:["Pizza","Sushi","Biryani","Shawarma"]},{q:"What makes them laugh most?",o:["Funny videos","Silly jokes","Friends","Unexpected humor"]},{q:"Their go-to stress relief?",o:["Sleep","Exercise","Cooking","TV"]},{q:"Their biggest dream?",o:["Travel the world","Own a home","Career success","Family life"]},{q:"Their ideal weekend?",o:["Stay home","Go out","Adventure","Family time"]},{q:"Their favourite drink?",o:["Arabic coffee","Tea","Juice","Water"]},{q:"What do they do when angry?",o:["Go quiet","Talk it out","Take a walk","Sleep on it"]},{q:"Their love language?",o:["Words of affirmation","Acts of service","Quality time","Gifts"]},{q:"What quality do they value most in you?",o:["Loyalty","Humour","Kindness","Support"]},{q:"Their favourite cuisine?",o:["Arabic","Italian","Japanese","Indian"]}];
const QS_AR=[{q:"ما هو الطعام المفضل لشريكك؟",o:["بيتزا","سوشي","برياني","شاورما"]},{q:"ما الذي يجعله/ها يضحك أكثر؟",o:["فيديوهات مضحكة","نكت سخيفة","الأصدقاء","الفكاهة المفاجئة"]},{q:"كيف يتعامل مع التوتر؟",o:["النوم","الرياضة","الطبخ","التلفاز"]},{q:"ما أكبر حلم له/لها؟",o:["السفر","امتلاك منزل","نجاح مهني","حياة عائلية"]},{q:"عطلة نهاية أسبوعه/ا المثالية؟",o:["البقاء في البيت","الخروج","المغامرة","وقت عائلي"]},{q:"مشروبه/ا المفضل؟",o:["قهوة عربية","شاي","عصير","ماء"]},{q:"ماذا يفعل عندما يكون غاضباً؟",o:["يصمت","يتكلم عنه","يأخذ نزهة","ينام على المشكلة"]},{q:"لغة حبه/ا؟",o:["كلمات التأكيد","أعمال الخدمة","وقت جيد","الهدايا"]},{q:"ما الصفة التي يقدرها فيك؟",o:["الوفاء","الفكاهة","اللطف","الدعم"]},{q:"مطبخه/ا المفضل؟",o:["عربي","إيطالي","ياباني","هندي"]}];
const LL_EN=[{q:"Your partner had a tough day. You naturally:",o:["Tell them how much you love them","Do something helpful without being asked","Spend quiet time just being present","Surprise them with a small gift","Give them a warm hug"],l:["words","acts","time","gifts","touch"]},{q:"You feel most loved when your partner:",o:["Compliments you or says 'I love you'","Does tasks to help you","Puts their phone down and focuses on you","Remembers and gets you something","Holds your hand or hugs you"],l:["words","acts","time","gifts","touch"]},{q:"On your anniversary, you prefer:",o:["A heartfelt letter or message","They plan and arrange everything","A full day just the two of you","A thoughtful, personal gift","Lots of hugs and closeness"],l:["words","acts","time","gifts","touch"]},{q:"You feel disconnected when your partner:",o:["Goes quiet and doesn't express feelings","Doesn't help with daily things","Is always busy and distracted","Forgets special occasions","Becomes physically distant"],l:["words","acts","time","gifts","touch"]},{q:"In a relationship, most important to you is:",o:["Hearing appreciation and kind words","Being supported through actions","Dedicated, undistracted time together","Thoughtful surprises and remembering","Physical presence and affection"],l:["words","acts","time","gifts","touch"]}];
const LL_AR=[{q:"شريكك كان يوماً صعباً. تتصرف:",o:["تخبره/ها كم تحبه/ها","تفعل شيئاً مفيداً له/لها","تجلس معه/ها هادئاً","تفاجئه/ها بهدية","تحتضنه/ها"],l:["words","acts","time","gifts","touch"]},{q:"تشعر بأكثر حب عندما يقوم شريكك:",o:["بمجاملتك أو قول أحبك","بأعمال مفيدة","بالتركيز عليك بدون هاتف","بتذكر شيء وإحضاره","بمسك يدك أو احتضانك"],l:["words","acts","time","gifts","touch"]},{q:"في ذكراكم، تفضل:",o:["رسالة من القلب","يخطط شريكك لكل شيء","يوم كامل أنتما فقط","هدية مدروسة","أحضان وقرب"],l:["words","acts","time","gifts","touch"]},{q:"تشعر بالانفصال عندما يقوم شريكك:",o:["بالصمت وعدم التعبير","بعدم المساعدة اليومية","بالانشغال الدائم","بنسيان المناسبات","بالابتعاد الجسدي"],l:["words","acts","time","gifts","touch"]},{q:"الأهم بالنسبة لك في العلاقة:",o:["كلمات التقدير","الدعم بالأفعال","وقت مخصص بدون تشتت","مفاجآت مدروسة","الحضور الجسدي"],l:["words","acts","time","gifts","touch"]}];
const CONVO_EN=["If we could move anywhere, where would you want to go and why?","What childhood memory shaped who you are today?","What's something you've always wanted to tell me but never found the right moment?","What dream have you given up on that I could help you revive?","When do you feel most loved by me?","What makes you feel most seen and understood?","Describe our perfect year together.","What's one thing I do that always makes you smile?","What does home mean to you?","If we could have dinner with anyone in history, who would you choose?","What new experience would you love us to try together this year?","What's a quality you see in me that I don't see in myself?"];
const CONVO_AR=["لو نقدر نعيش أي مكان في العالم، وين تختار ولماذا؟","ما ذكرى الطفولة التي شكّلت شخصيتك؟","ما الشيء الذي أردت دائماً إخباري به لكن لم تجد اللحظة المناسبة؟","ما الحلم الذي تخليت عنه ويمكنني مساعدتك في إحيائه؟","متى تشعر بأكثر حب من طرفي؟","ما الذي يجعلك تشعر بأنني أفهمك حقاً؟","صف سنتنا المثالية معاً.","ما الشيء الذي أفعله دائماً يجعلك تبتسم؟","ماذا يعني البيت لك؟","لو نقدر نتعشى مع أي شخص في التاريخ، من ستختار؟","ما الشيء الجديد الذي تودّ أن نجربه هذه السنة؟","ما صفة تراها فيّ ولا أراها في نفسي؟"];
// ── COUPLE GAMES STATE ──────────────────────────────────
let _qi=0,_qs=0,_qMode='',_llScores={words:0,acts:0,time:0,gifts:0,touch:0},_lli=0,_ci=0;
let _syncGamePollInterval=null;

// Sync this player's game result to cloud (keyed by partner code + mode)
async function syncGameResult(mode, payload) {
  const code = LS.get('aw_partner_code','') || getCode();
  if(!code) return;
  const key = code+':game:'+mode;
  const myName = (profile&&profile.n1)||'Me';
  try {
    await fetch(DEFAULT_PROXY+'/sync', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({code:key, player:myName, ...payload, ts:Date.now()})
    });
  } catch(e){}
}

// Fetch partner's game result from cloud
async function fetchPartnerGameResult(mode) {
  const partnerCode = LS.get('aw_partner_code','');
  if(!partnerCode) return null;
  const key = partnerCode+':game:'+mode;
  try {
    const res = await fetch(DEFAULT_PROXY+'/partner/'+encodeURIComponent(key));
    const d = await res.json();
    if(d.ok && d.data && d.data.ts) return d.data;
  } catch(e){}
  return null;
}

function openQuiz(){
  const sh=getSheet('quiz-sh');
  const hasPartner = !!LS.get('aw_partner_code','');
  sh.querySelector('.sheet').innerHTML=`<div class="sheet-handle"></div>
  <div style="text-align:center;margin-bottom:16px">
    <div style="font-size:40px;margin-bottom:8px">🎮</div>
    <h3 style="font-family:'Cormorant Garamond',serif;color:var(--rose);margin:0 0 4px;font-size:22px">${isAr?'ألعاب الأزواج':'Couples Games'}</h3>
    ${hasPartner?`<div style="font-size:11px;background:rgba(232,132,154,.1);color:var(--rose);border-radius:20px;padding:4px 12px;display:inline-block;margin-top:4px">🔗 ${isAr?'متصل بشريكك':'Connected with partner'}</div>`:
    `<div style="font-size:11px;color:var(--text-soft);margin-top:4px">${isAr?'ربط شريكك في الملف الشخصي لمنافسة مزدوجة':'Link your partner in Profile for live sync'}</div>`}
  </div>
  <div style="display:flex;flex-direction:column;gap:12px">
    <div class="tap" onclick="startQuiz('couples')" style="background:var(--card2);border:1.5px solid var(--border);border-radius:16px;padding:18px;display:flex;gap:14px;align-items:center">
      <div style="font-size:32px">💑</div>
      <div style="flex:1"><div style="font-weight:700;font-size:15px;color:var(--text)">${isAr?'كم تعرفان بعض؟':'How Well Do You Know Each Other?'}</div>
      <div style="font-size:12px;color:var(--text-soft)">${isAr?'كل واحد يجيب منفرداً ثم نقارن النتائج':'Each answers alone, then compare scores'}</div></div>
      ${hasPartner?'<span style="font-size:18px">🏆</span>':''}
    </div>
    <div class="tap" onclick="startQuiz('love')" style="background:var(--card2);border:1.5px solid var(--border);border-radius:16px;padding:18px;display:flex;gap:14px;align-items:center">
      <div style="font-size:32px">❤️</div>
      <div style="flex:1"><div style="font-weight:700;font-size:15px;color:var(--text)">${isAr?'اكتشف لغة حبك':'Discover Your Love Language'}</div>
      <div style="font-size:12px;color:var(--text-soft)">${isAr?'كلاكما يجيب ثم نكشف نتائجكما معاً':'Both answer, then reveal together simultaneously'}</div></div>
      ${hasPartner?'<span style="font-size:18px">💞</span>':''}
    </div>
    <div class="tap" onclick="startQuiz('convo')" style="background:var(--card2);border:1.5px solid var(--border);border-radius:16px;padding:18px;display:flex;gap:14px;align-items:center">
      <div style="font-size:32px">💬</div>
      <div style="flex:1"><div style="font-weight:700;font-size:15px;color:var(--text)">${isAr?'بطاقات المحادثة العميقة':'Deep Conversation Cards'}</div>
      <div style="font-size:12px;color:var(--text-soft)">${isAr?'الأول يجيب، الثاني ينتظر، ثم تبادلا الإجابات':'One answers first, then swap — build intimacy'}</div></div>
      ${hasPartner?'<span style="font-size:18px">🔄</span>':''}
    </div>
  </div>`;
  sh.classList.add('open');hap.tap();
}

function startQuiz(mode){
  _qMode=mode;_qi=0;_qs=0;_llScores={words:0,acts:0,time:0,gifts:0,touch:0};_lli=0;
  _ci=Math.floor(Math.random()*CONVO_EN.length);
  if(_syncGamePollInterval){ clearInterval(_syncGamePollInterval); _syncGamePollInterval=null; }
  if(mode==='convo') renderConvo();
  else if(mode==='love') renderLL();
  else renderCouplesQ();
}

function renderCouplesQ(){
  const sh=getSheet('quiz-sh');const Qs=isAr?QS_AR:QS_EN;
  if(_qi>=Qs.length){
    const pct=Math.round(_qs/Qs.length*100);
    const hasPartner=!!LS.get('aw_partner_code','');
    // Upload my score and wait for partner
    syncGameResult('couples',{score:_qs,pct:pct,total:Qs.length});
    if(hasPartner){
      sh.querySelector('.sheet').innerHTML=`<div class="sheet-handle"></div>
      <div style="text-align:center;padding:20px 0">
        <div style="font-size:56px;margin-bottom:12px">${pct>=80?'🏆':pct>=60?'💕':'🌱'}</div>
        <h2 style="font-family:'Cormorant Garamond',serif;color:var(--rose);margin-bottom:6px">${isAr?'نتيجتك: '+_qs+'/'+Qs.length:'Your Score: '+_qs+'/'+Qs.length}</h2>
        <div style="font-size:34px;font-weight:800;color:var(--rose);margin-bottom:12px">${pct}%</div>
        <div style="background:rgba(232,132,154,.08);border:1px solid rgba(232,132,154,.2);border-radius:14px;padding:14px;margin-bottom:16px">
          <div style="font-size:13px;color:var(--rose);font-weight:700;margin-bottom:6px">⏳ ${isAr?'انتظار شريكك...':'Waiting for your partner...'}</div>
          <div style="font-size:12px;color:var(--text-soft)">${isAr?'شريكك يلعب الآن. سيظهر تحديه هنا تلقائياً.':'Your partner is playing. Their result will appear here.'}</div>
        </div>
        <div id="partner-quiz-result" style="margin-bottom:14px"></div>
        <button class="btn-rose" style="margin-bottom:10px" onclick="startQuiz('couples')">${isAr?'العب مجدداً':'Play Again'}</button>
        <button class="btn-ghost" onclick="closeSheet('quiz-sh')">${isAr?'إنهاء':'Done'}</button>
      </div>`;
      // Poll for partner result
      _syncGamePollInterval=setInterval(async function(){
        var pd=await fetchPartnerGameResult('couples');
        var el=document.getElementById('partner-quiz-result');
        if(pd&&pd.score!==undefined&&el){
          clearInterval(_syncGamePollInterval);
          var pName=pd.player||(isAr?'شريكك':'Partner');
          var myWon=_qs>pd.score,tie=_qs===pd.score;
          el.innerHTML=`<div style="background:${tie?'rgba(201,149,74,.1)':myWon?'rgba(80,200,120,.1)':'rgba(232,132,154,.1)'};border:1.5px solid ${tie?'var(--gold)':myWon?'#50c878':'var(--rose)'};border-radius:14px;padding:14px">
            <div style="font-size:20px;margin-bottom:6px">${tie?'🤝':myWon?'🥇':'🥈'}</div>
            <div style="font-weight:700;font-size:13px;color:var(--text);margin-bottom:6px">${pName}: ${pd.score}/${pd.total} (${pd.pct}%)</div>
            <div style="font-size:12px;color:var(--text-soft)">${tie?(isAr?'تعادل مثالي! 🤝':'Perfect tie! 🤝'):myWon?(isAr?'أنت الفائز! 🏆':'You win! 🏆'):(isAr?pName+' يفوز! حاول مجدداً 💪':pName+' wins! Try again 💪')}</div>
          </div>`;
          hap.celebrate();
        }
      },3000);
    } else {
      sh.querySelector('.sheet').innerHTML=`<div class="sheet-handle"></div><div style="text-align:center;padding:16px 0"><div style="font-size:60px;margin-bottom:14px">${pct>=80?'🏆':pct>=60?'💕':'🌱'}</div><h2 style="font-family:'Cormorant Garamond',serif;color:var(--rose);margin-bottom:8px">${isAr?'النتيجة: '+_qs+'/'+Qs.length:'Score: '+_qs+'/'+Qs.length}</h2><div style="font-size:36px;font-weight:800;color:var(--rose);margin-bottom:8px">${pct}%</div><div style="font-size:15px;color:var(--text-mid);margin-bottom:8px">${pct>=80?(isAr?'تعرفان بعض جداً! 🏆':'You know each other amazingly! 🏆'):pct>=60?(isAr?'معرفة جيدة! 💕':'Pretty good! 💕'):(isAr?'مجال للتطور معاً 🌱':'Room to grow together 🌱')}</div><div style="font-size:12px;color:var(--text-soft);margin-bottom:16px">${isAr?'ربط شريكك في الملف الشخصي للمنافسة المزدوجة':'Link your partner in Profile for head-to-head competition'}</div><button class="btn-rose" style="margin-bottom:12px" onclick="startQuiz('couples')">${isAr?'العب مجدداً':'Play Again'}</button><button class="btn-ghost" onclick="closeSheet('quiz-sh')">${isAr?'إنهاء':'Done'}</button></div>`;
      hap.celebrate();
    }
    return;
  }
  const q=Qs[_qi];
  sh.querySelector('.sheet').innerHTML=`<div class="sheet-handle"></div>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
    <span style="font-size:12px;font-weight:700;color:var(--text-soft)">${isAr?'سؤال':'Q'} ${_qi+1}/${Qs.length}</span>
    <span style="font-size:12px;font-weight:700;color:var(--rose)">🏆 ${_qs}</span>
  </div>
  <div class="quiz-card" style="margin-bottom:20px"><div style="font-size:36px;margin-bottom:14px">🤔</div><div style="font-size:17px;font-weight:700;color:var(--text);line-height:1.5">${q.q}</div></div>
  <div>${q.o.map((o)=>`<div class="quiz-opt" onclick="answerQ(this)">${o}</div>`).join('')}</div>`;
}
function answerQ(el){el.classList.add('sel');_qs++;hap.success();setTimeout(()=>{_qi++;renderCouplesQ()},700)}

function renderLL(){
  const sh=getSheet('quiz-sh');const Qs=isAr?LL_AR:LL_EN;
  const NAMES_EN={words:'Words of Affirmation 💬',acts:'Acts of Service 🤝',time:'Quality Time ⏰',gifts:'Gift Giving 🎁',touch:'Physical Touch 💕'};
  const NAMES_AR={words:'كلمات التأكيد 💬',acts:'أعمال الخدمة 🤝',time:'الوقت الجيد ⏰',gifts:'الهدايا 🎁',touch:'اللمسة الجسدية 💕'};
  const DESC_EN={words:'You feel most loved through kind words, compliments, and verbal appreciation.',acts:'Love shown through helpful actions and support means the most to you.',time:'Undivided attention and focused time together means everything.',gifts:'Thoughtful presents and remembered moments speak to your heart.',touch:'Physical affection — hugs, holding hands — keeps you connected.'};
  const DESC_AR={words:'تشعر بأكثر حب من خلال الكلمات الطيبة والتقدير.',acts:'الحب الظاهر بالأفعال المفيدة يعني لك الأكثر.',time:'الاهتمام الكامل والوقت المركز معاً يعني كل شيء.',gifts:'الهدايا المدروسة وتذكر اللحظات تصل لقلبك.',touch:'المودة الجسدية طريقتك للتواصل.'};
  if(_lli>=Qs.length){
    const top=Object.entries(_llScores).sort((a,b)=>b[1]-a[1])[0][0];
    const hasPartner=!!LS.get('aw_partner_code','');
    syncGameResult('love',{lang:top,langName:isAr?NAMES_AR[top]:NAMES_EN[top]});
    if(hasPartner){
      sh.querySelector('.sheet').innerHTML=`<div class="sheet-handle"></div>
      <div style="text-align:center;padding:16px 0">
        <div style="font-size:52px;margin-bottom:12px">❤️</div>
        <div style="font-size:13px;color:var(--text-soft);margin-bottom:4px">${isAr?'لغة حبك:':'Your Love Language:'}</div>
        <h2 style="font-family:'Cormorant Garamond',serif;color:var(--rose);font-size:22px;margin-bottom:12px">${isAr?NAMES_AR[top]:NAMES_EN[top]}</h2>
        <div style="background:rgba(232,132,154,.08);border:1px solid rgba(232,132,154,.2);border-radius:14px;padding:14px;margin-bottom:14px">
          <div style="font-size:13px;color:var(--rose);font-weight:700;margin-bottom:6px">⏳ ${isAr?'انتظار شريكك...':'Waiting for partner...'}</div>
          <div style="font-size:12px;color:var(--text-soft)">${isAr?'شريكك يكمل الاختبار. إجابتاكما ستظهران معاً!':'Partner is finishing. Both results will reveal together!'}</div>
        </div>
        <div id="partner-love-result"></div>
        <button class="btn-ghost" style="margin-top:12px" onclick="closeSheet('quiz-sh')">${isAr?'إنهاء':'Done'}</button>
      </div>`;
      _syncGamePollInterval=setInterval(async function(){
        var pd=await fetchPartnerGameResult('love');
        var el=document.getElementById('partner-love-result');
        if(pd&&pd.lang&&el){
          clearInterval(_syncGamePollInterval);
          var pName=pd.player||(isAr?'شريكك':'Partner');
          el.innerHTML=`<div style="display:grid;gap:10px">
            <div style="background:rgba(201,149,74,.08);border:1px solid rgba(201,149,74,.3);border-radius:14px;padding:14px">
              <div style="font-size:11px;color:var(--gold);font-weight:700;margin-bottom:6px">${pName} ${isAr?'يحب:':'loves via:'}</div>
              <div style="font-size:16px;font-weight:700;color:var(--text)">${isAr?NAMES_AR[pd.lang]:NAMES_EN[pd.lang]}</div>
              <div style="font-size:12px;color:var(--text-soft);margin-top:6px">${isAr?DESC_AR[pd.lang]:DESC_EN[pd.lang]}</div>
            </div>
            ${top===pd.lang?`<div style="background:rgba(80,200,120,.1);border-radius:12px;padding:12px;font-size:13px;font-weight:700;color:#50c878;text-align:center">💞 ${isAr?'لغة حبكما واحدة! 💞':'Same love language! 💞'}</div>`:
            `<div style="background:rgba(255,255,255,.04);border-radius:12px;padding:12px;font-size:12px;color:var(--text-soft);text-align:center">${isAr?'لغتان مختلفتان — سراً وجميلاً 💕':'Different languages — the beauty of complementing each other 💕'}</div>`}
          </div>`;
          hap.celebrate();
        }
      },3000);
    } else {
      sh.querySelector('.sheet').innerHTML=`<div class="sheet-handle"></div><div style="text-align:center;padding:16px 0"><div style="font-size:52px;margin-bottom:14px">❤️</div><div style="font-size:13px;color:var(--text-soft);margin-bottom:6px">${isAr?'لغة حبك:':'Your Love Language:'}</div><h2 style="font-family:'Cormorant Garamond',serif;color:var(--rose);font-size:24px;margin-bottom:14px">${isAr?NAMES_AR[top]:NAMES_EN[top]}</h2><div style="background:var(--rose-pale);border-radius:16px;padding:16px;margin-bottom:14px;font-size:14px;color:var(--text-mid);line-height:1.7">${isAr?DESC_AR[top]:DESC_EN[top]}</div><button class="btn-rose" style="margin-bottom:12px" onclick="startQuiz('love')">${isAr?'اختبر مجدداً':'Try Again'}</button><button class="btn-ghost" onclick="closeSheet('quiz-sh')">${isAr?'إنهاء':'Done'}</button></div>`;
      hap.celebrate();
    }
    return;
  }
  const q=Qs[_lli];
  sh.querySelector('.sheet').innerHTML=`<div class="sheet-handle"></div>
  <div style="display:flex;justify-content:space-between;margin-bottom:16px">
    <span style="font-size:12px;font-weight:700;color:var(--text-soft)">${isAr?'سؤال':'Q'} ${_lli+1}/5</span>
    <span style="font-size:12px;color:var(--rose)">❤️ ${isAr?'لغة الحب':'Love Language'}</span>
  </div>
  <div class="quiz-card" style="margin-bottom:20px;min-height:120px"><div style="font-size:16px;font-weight:700;color:var(--text);line-height:1.6">${q.q}</div></div>
  <div>${q.o.map((o,i)=>`<div class="quiz-opt" onclick="answerLL(this,'${q.l[i]}')">${o}</div>`).join('')}</div>`;
}
function answerLL(el,lang){_llScores[lang]++;el.classList.add('sel');hap.success();setTimeout(()=>{_lli++;renderLL()},700)}

function renderConvo(){
  const sh=getSheet('quiz-sh');const cards=isAr?CONVO_AR:CONVO_EN;
  const hasPartner=!!LS.get('aw_partner_code','');
  const myName=(profile&&profile.n1)||(isAr?'أنا':'Me');
  const partnerName=(profile&&profile.n2)||(isAr?'شريكك':'Partner');
  const card=cards[_ci%cards.length];
  const myTurn=(_ci%2===0);
  sh.querySelector('.sheet').innerHTML=`<div class="sheet-handle"></div>
  <div style="text-align:center;margin-bottom:12px">
    <span style="font-size:11px;font-weight:800;color:var(--text-soft);text-transform:uppercase;letter-spacing:.07em">${isAr?'بطاقة محادثة عميقة':'Deep Conversation Card'}</span>
    ${hasPartner?`<div style="margin-top:6px;font-size:11px;color:${myTurn?'var(--rose)':'var(--gold)'};font-weight:700">${myTurn?(isAr?'🎤 دورك للإجابة':'🎤 Your turn to answer'):(isAr?'🎤 دور شريكك للإجابة':'🎤 Partner\'s turn to answer')}</div>`:''}
  </div>
  <div class="quiz-card" style="min-height:160px;margin-bottom:16px">
    <div style="font-size:32px;margin-bottom:14px">💬</div>
    <div style="font-size:17px;font-weight:700;color:var(--text);line-height:1.6">"${card}"</div>
  </div>
  ${hasPartner?`<div style="background:rgba(232,132,154,.06);border-radius:14px;padding:12px;margin-bottom:14px">
    <div style="font-size:12px;color:var(--text-soft);margin-bottom:8px">${myTurn?(isAr?myName+' يجيب أولاً، ثم يشارك مع '+partnerName:myName+' answers first, then shares with '+partnerName):(isAr?partnerName+' يجيب الآن، ثم أنت':partnerName+' answers now, then you')}</div>
    <textarea id="convo-answer" placeholder="${isAr?'إجابتك هنا...':'Your answer here...'}" style="width:100%;background:var(--card2);border:1px solid var(--border);border-radius:10px;padding:10px;font-size:14px;font-family:inherit;color:var(--text);min-height:80px;resize:none;box-sizing:border-box"></textarea>
    <button class="btn-rose" style="width:100%;margin-top:8px;padding:10px;font-size:13px" onclick="shareConvoAnswer('${card.replace(/'/g,'\\\'')}')">${isAr?'شارك إجابتي 💕':'Share My Answer 💕'}</button>
  </div>`:''}
  <div id="shared-convo-answers"></div>
  <div style="display:flex;gap:10px;margin-top:4px">
    <button class="btn-ghost" style="flex:1;padding:12px" onclick="_ci--;hap.tap();renderConvo()">← ${isAr?'السابق':'Prev'}</button>
    <button class="btn-rose" style="flex:1;padding:12px" onclick="_ci++;hap.tap();renderConvo()">${isAr?'التالي':'Next'} →</button>
  </div>
  <button class="btn-ghost" style="width:100%;margin-top:10px;padding:10px;font-size:12px" onclick="closeSheet('quiz-sh')">${isAr?'إنهاء':'Done'}</button>`;
  // Check for partner's shared answers
  if(hasPartner) {
    fetchPartnerGameResult('convo:'+(_ci%cards.length)).then(function(pd){
      var el=document.getElementById('shared-convo-answers');
      if(pd&&pd.answer&&el){
        var pName=pd.player||(isAr?'شريكك':'Partner');
        el.innerHTML=`<div style="background:rgba(201,149,74,.08);border:1px solid rgba(201,149,74,.2);border-radius:12px;padding:12px;margin-bottom:10px">
          <div style="font-size:11px;font-weight:700;color:var(--gold);margin-bottom:4px">💬 ${pName}:</div>
          <div style="font-size:13px;color:var(--text-mid);line-height:1.6">${pd.answer}</div>
        </div>`;
      }
    });
  }
}
async function shareConvoAnswer(cardText) {
  const ans=document.getElementById('convo-answer')?.value.trim();
  if(!ans){T(isAr?'اكتب إجابتك أولاً':'Write your answer first');return;}
  await syncGameResult('convo:'+(_ci%((isAr?CONVO_AR:CONVO_EN).length)),{answer:ans,question:cardText});
  hap.success();
  T(isAr?'تمت المشاركة! 💕':'Shared with partner! 💕');
  renderConvo();
}

// ══════════════════════════════════════════════════
//  GRATITUDE CHALLENGE
// ══════════════════════════════════════════════════
function openGrat(){
  const dayNum=gratState.days.length+1;
  const sh=getSheet('grat-sh');
  sh.querySelector('.sheet').innerHTML=`<div class="sheet-handle"></div><h3 style="font-family:'Cormorant Garamond',serif;color:var(--rose);margin-bottom:6px;font-size:20px">✍️ ${isAr?'يوم '+dayNum+' من 7':'Day '+dayNum+' of 7'}</h3><p style="font-size:13px;color:var(--text-soft);margin-bottom:20px">${isAr?'اكتب 3 أشياء تحبها في شريكك اليوم:':'Write 3 things you love about your partner today:'}</p>${[1,2,3].map(i=>`<div style="margin-bottom:14px"><label class="label">${isAr?'الشيء '+i:'Thing '+i}</label><input id="g${i}" placeholder="${isAr?'أحب فيك...':'I love that you...'}"></div>`).join('')}<button class="btn-rose" onclick="saveGrat(${dayNum})">${isAr?'حفظ 💕':'Save 💕'}</button>`;
  sh.classList.add('open');hap.tap();
}
function saveGrat(day){
  const e1=document.getElementById('g1')?.value.trim();
  const e2=document.getElementById('g2')?.value.trim();
  const e3=document.getElementById('g3')?.value.trim();
  if(!e1){T(isAr?'اكتب شيئاً واحداً على الأقل':'Write at least one thing');hap.error();return}
  if(!gratState.days.includes(day))gratState.days.push(day);
  gratState.entries[day]=[e1,e2,e3];LS.set('aw_grat',gratState);closeSheet('grat-sh');
  if(gratState.days.length>=7){hap.celebrate();setTimeout(()=>{document.getElementById('ach-overlay').classList.add('open')},600)}
  else{hap.success();T(isAr?'تم الحفظ! '+gratState.days.length+'/7 أيام 💕':'Saved! '+gratState.days.length+'/7 days 💕')}
  showTab('profile');
}

// ══════════════════════════════════════════════════
//  OCCASIONS / MEMORIES / HABITS
// ══════════════════════════════════════════════════
function openAddOcc(){const sh=getSheet('occ-sh');sh.querySelector('.sheet').innerHTML=`<div class="sheet-handle"></div><h3 style="font-family:'Cormorant Garamond',serif;margin-bottom:20px;color:var(--rose)">${isAr?'إضافة مناسبة ⏰':'Add Occasion ⏰'}</h3><div style="margin-bottom:14px"><label class="label">${isAr?'الاسم':'Name'}</label><input id="oc-n" placeholder="${isAr?'عيد ميلاد، عيد...':'Birthday, Eid...'}"></div><div style="margin-bottom:14px"><label class="label">${isAr?'التاريخ':'Date'}</label><input id="oc-d" type="date"></div><div style="margin-bottom:20px"><label class="label">${isAr?'رمز':'Emoji'}</label><div style="display:flex;gap:8px;flex-wrap:wrap">${['🎂','💍','🎉','🌙','❤️','🎁','✈️','🌸','🏡','👶'].map(e=>`<span style="font-size:24px;cursor:pointer;padding:6px;border-radius:8px;transition:all .15s" onclick="selOcEm('${e}',this)">${e}</span>`).join('')}</div><input id="oc-e" type="hidden" value="🎉"></div><button class="btn-rose" onclick="saveOcc()">${isAr?'حفظ 💕':'Save 💕'}</button>`;sh.classList.add('open');hap.tap()}
function selOcEm(e,el){document.getElementById('oc-e').value=e;el.parentElement.querySelectorAll('span').forEach(s=>s.style.background='none');el.style.background='var(--rose-glow)';hap.tap()}
function saveOcc(){const n=document.getElementById('oc-n')?.value.trim();const d=document.getElementById('oc-d')?.value;const e=document.getElementById('oc-e')?.value;if(!n||!d){T(isAr?'أكمل الحقول':'Fill all fields');hap.error();return}occasions.push({id:Date.now()+'',n,d,e});LS.set('aw_occasions',occasions);closeSheet('occ-sh');hap.success();T(isAr?'تم الحفظ! ⏰':'Saved! ⏰');showTab('memories')}
async function getOccIdea(name,days){if(!canUse()){showPaywall();return}T(isAr?'يحضر أفكاراً... 💕':'Getting ideas...');useCredit();const p=profile||{};const reply=await callAI([{role:'user',content:isAr?`${name} بعد ${days} يوم. اقترح 5 أفكار لـ ${p.n1||'الزوجين'} و${p.n2||''}. هدايا وأنشطة ومفاجآت.`:`${name} in ${days} days. Suggest 5 specific ideas: gifts, activities, surprises for ${p.n1||'a couple'}${p.n2?' and '+p.n2:''}.`}]);const sh=getSheet('idea-sh');sh.querySelector('.sheet').innerHTML=`<div class="sheet-handle"></div><h3 style="font-family:'Cormorant Garamond',serif;color:var(--rose);margin-bottom:16px;font-size:20px">✨ ${isAr?'أفكار لـ':'Ideas for'} ${name}</h3>${reply.startsWith('⏰')?`<div class="ai-error">${reply}</div>`:`<div style="font-size:14px;line-height:1.9;color:var(--text)">${reply.replace(/\n/g,'<br>')}</div>`}<button class="btn-rose" style="margin-top:16px" onclick="closeSheet('idea-sh')">${isAr?'حسناً 💕':'Got it! 💕'}</button>`;sh.classList.add('open');updateCredits();hap.success()}
function openAddMemory(){const sh=getSheet('mem-sh');sh.querySelector('.sheet').innerHTML=`<div class="sheet-handle"></div><h3 style="font-family:'Cormorant Garamond',serif;margin-bottom:20px;color:var(--rose)">${isAr?'إضافة ذكرى 💕':'Add Memory 💕'}</h3><div style="margin-bottom:14px"><label class="label">${isAr?'العنوان':'Title'}</label><input id="m-ti" placeholder="${isAr?'رحلتنا الأولى...':'Our first trip...'}"></div><div style="margin-bottom:14px"><label class="label">${isAr?'التاريخ':'Date'}</label><input id="m-dt" type="date" value="${new Date().toISOString().split('T')[0]}"></div><div style="margin-bottom:14px"><label class="label">${isAr?'ملاحظات':'Notes'}</label><textarea id="m-nt" rows="3" placeholder="${isAr?'ما الذي جعل هذه اللحظة مميزة...':'What made this special...'}"></textarea></div><div style="margin-bottom:20px"><label class="label">${isAr?'الفئة':'Category'}</label><select id="m-em"><option value="💑">${isAr?'💑 معاً':'💑 Together'}</option><option value="✈️">${isAr?'✈️ سفر':'✈️ Travel'}</option><option value="🎂">${isAr?'🎂 احتفال':'🎂 Celebration'}</option><option value="🌹">${isAr?'🌹 رومانسي':'🌹 Romantic'}</option><option value="👶">${isAr?'👶 عائلة':'👶 Family'}</option><option value="💕">${isAr?'💕 يومي':'💕 Everyday'}</option></select></div><button class="btn-rose" onclick="saveMemory()">${isAr?'حفظ الذكرى 💕':'Save Memory 💕'}</button>`;sh.classList.add('open');hap.tap()}
function saveMemory(){const ti=document.getElementById('m-ti')?.value.trim();const dt=document.getElementById('m-dt')?.value;if(!ti){T(isAr?'أضف عنواناً':'Add a title');hap.error();return}const nt=document.getElementById('m-nt')?.value;const em=document.getElementById('m-em')?.value;memories.push({id:Date.now()+'',title:ti,date:dt,note:nt,em});LS.set('aw_memories',memories);closeSheet('mem-sh');hap.success();T(isAr?'تم حفظ الذكرى! 💕':'Memory saved! 💕');showTab('memories')}
function delMemory(id){if(!confirm(isAr?'حذف هذه الذكرى؟':'Delete this memory?'))return;memories=memories.filter(m=>m.id!==id);LS.set('aw_memories',memories);hap.tap();showTab('memories')}
function openAddHabit(){const sh=getSheet('hab-sh');const sug=isAr?[{e:'🌙',n:'صلاة المساء معاً'},{e:'🍽️',n:'عشاء بدون هواتف'},{e:'💬',n:'10 دقائق حوار'},{e:'🚶',n:'مشية مسائية'},{e:'💌',n:'رسالة حب يومية'},{e:'☕',n:'قهوة الصباح معاً'},{e:'🙏',n:'مشاركة الامتنان'},{e:'📖',n:'قراءة معاً'}]:[{e:'🌙',n:'Evening Prayer Together'},{e:'🍽️',n:'Phone-free Dinner'},{e:'💬',n:'10 Min Deep Talk'},{e:'🚶',n:'Evening Walk'},{e:'💌',n:'Daily Love Message'},{e:'☕',n:'Morning Coffee'},{e:'🙏',n:'Gratitude Sharing'},{e:'📖',n:'Read Together'}];sh.querySelector('.sheet').innerHTML=`<div class="sheet-handle"></div><h3 style="font-family:'Cormorant Garamond',serif;margin-bottom:16px;color:var(--rose)">${isAr?'إضافة عادة 🎯':'Add Habit 🎯'}</h3><div style="margin-bottom:14px"><label class="label">${isAr?'اسم العادة':'Habit name'}</label><div style="display:flex;gap:8px"><input id="h-n" placeholder="${isAr?'عادتنا اليومية...':'Our daily habit...'}" style="flex:1"><input id="h-e" value="🎯" style="width:56px;text-align:center;font-size:20px"></div></div><div style="margin-bottom:20px"><label class="label">${isAr?'إضافة سريعة':'Quick add'}</label><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${sug.map(s=>`<div class="tap" onclick="quickHabit('${s.n}','${s.e}')" style="background:var(--card2);border:1px solid var(--border);border-radius:12px;padding:10px;font-size:12px;display:flex;align-items:center;gap:8px"><span style="font-size:18px">${s.e}</span><span style="color:var(--text-mid)">${s.n}</span></div>`).join('')}</div></div><button class="btn-rose" onclick="saveHabit()">${isAr?'إضافة العادة':'Add Habit'}</button>`;sh.classList.add('open');hap.tap()}
function quickHabit(n,e){habits.push({id:Date.now()+'',n,e,c:[]});LS.set('aw_habits',habits);closeSheet('hab-sh');hap.success();T(e+' '+n+' '+(isAr?'تمت الإضافة!':'added!'));showTab('home')}
function saveHabit(){const n=document.getElementById('h-n')?.value.trim();const e=document.getElementById('h-e')?.value;if(!n){T(isAr?'أدخل اسم العادة':'Enter habit name');return}habits.push({id:Date.now()+'',n,e,c:[]});LS.set('aw_habits',habits);closeSheet('hab-sh');hap.success();T(isAr?'تمت إضافة العادة! 🎯':'Habit added! 🎯');showTab('home')}
function toggleHabit(id){const today=new Date().toDateString();habits=habits.map(h=>{if(h.id!==id)return h;const c=h.c||[];const done=c.includes(today);return{...h,c:done?c.filter(x=>x!==today):[...c,today]}});LS.set('aw_habits',habits);const done=habits.find(h=>h.id===id)?.c.includes(today);hap[done?'success':'tap']();T(done?'✅ '+(isAr?'تم!':'Done!'):(isAr?'تم الإلغاء':'Unmarked'));showTab('home')}

// ══════════════════════════════════════════════════
//  BADGE SHARING
// ══════════════════════════════════════════════════
async function shareBadge(){
  const btn=document.getElementById('share-badge-btn');if(!btn)return;
  btn.textContent=isAr?'جارٍ...':'Generating...';hap.tap();
  try{
    const el=document.getElementById('ach-badge-el');
    const canvas=await html2canvas(el,{scale:2,backgroundColor:'#1E1118',useCORS:true,logging:false});
    const imgData=canvas.toDataURL('image/png');
    btn.innerHTML=isAr?'<span class="ar">شارك الوسام ✨</span>':'<span class="en">Share Badge ✨</span>';
    if(navigator.share){const res=await fetch(imgData);const blob=await res.blob();const file=new File([blob],'AnaWyak_HarmonyBadge.png',{type:'image/png'});await navigator.share({files:[file],title:'أنا وياك Harmony Badge',text:isAr?'أكملنا تحدي الوفاق 7 أيام! #أنا_وياك':'We completed the 7-Day Harmony Challenge! #AnaWyak'});hap.celebrate()}
    else{const a=document.createElement('a');a.href=imgData;a.download='AnaWyak_Badge.png';document.body.appendChild(a);a.click();document.body.removeChild(a);hap.success()}
  }catch(e){const btn2=document.getElementById('share-badge-btn');if(btn2)btn2.innerHTML=isAr?'<span class="ar">شارك الوسام ✨</span>':'<span class="en">Share Badge ✨</span>';T(isAr?'حدث خطأ':'Error')}
}

// ══════════════════════════════════════════════════
//  PAIRING URL
// ══════════════════════════════════════════════════
function checkPairURL(){
  const params=new URLSearchParams(window.location.search);const pairId=params.get('pair');
  if(pairId&&profile){profile.code=pairId;LS.set('aw_profile',profile);document.getElementById('pair-modal').classList.add('open');hap.celebrate()}
}
function closePairModal(){const m=document.getElementById('pair-modal');m.classList.remove('open');window.history.replaceState({},document.title,window.location.pathname);hap.tap()}

// ══════════════════════════════════════════════════
//  PAYWALL
// ══════════════════════════════════════════════════
function paywallContact(){
  showContactModal();
}

function showContactModal(){
  var existing = document.getElementById('contact-modal');
  if(existing) existing.remove();
  var email = 'support@anawyak.app';
  var div = document.createElement('div');
  div.id = 'contact-modal';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);backdrop-filter:blur(4px);z-index:9998;display:flex;align-items:flex-end;justify-content:center';
  div.onclick = function(e){ if(e.target===div) div.remove(); };
  div.innerHTML =
    '<div style="background:var(--card);border-radius:24px 24px 0 0;padding:28px 24px 40px;width:100%;max-width:480px;box-shadow:0 -8px 40px rgba(0,0,0,.3)">' +
      '<div style="width:36px;height:4px;background:var(--border);border-radius:2px;margin:0 auto 20px"></div>' +
      '<div style="text-align:center;margin-bottom:20px">' +
        '<div style="font-size:40px;margin-bottom:10px">💌</div>' +
        '<div style="font-family:\'Cormorant Garamond\',serif;font-size:22px;font-weight:700;color:var(--rose);margin-bottom:6px">' + (isAr?'تواصل معنا':'Contact Us') + '</div>' +
        '<div style="font-size:13px;color:var(--text-soft);line-height:1.6">' + (isAr?'فريقنا يرد خلال ساعات. نحن هنا لمساعدتك.':'Our team replies within hours. We\'re here for you.') + '</div>' +
      '</div>' +
      '<div style="background:var(--rose-pale);border-radius:16px;padding:16px;text-align:center;margin-bottom:16px">' +
        '<div style="font-size:11px;font-weight:700;color:var(--text-soft);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Email</div>' +
        '<div style="font-size:17px;font-weight:800;color:var(--rose);margin-bottom:10px">' + email + '</div>' +
        '<button onclick="navigator.clipboard?.writeText(\''+email+'\').then(function(){document.getElementById(\'cp-ok\').style.opacity=1;setTimeout(function(){document.getElementById(\'cp-ok\').style.opacity=0},1500)}).catch(function(){});hap.success()" style="background:var(--rose);color:#fff;border:none;border-radius:20px;padding:8px 20px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">' + (isAr?'📋 نسخ البريد':'📋 Copy Email') + '</button>' +
        '<div id="cp-ok" style="font-size:12px;color:#4CAF50;font-weight:700;margin-top:8px;opacity:0;transition:opacity .3s">' + (isAr?'✓ تم النسخ':'✓ Copied') + '</div>' +
      '</div>' +
      '<a href="mailto:'+email+'?subject='+encodeURIComponent('Ana Wyak Support')+'" style="display:block;text-align:center;background:none;border:1px solid rgba(232,132,154,.3);color:var(--rose);border-radius:20px;padding:12px;font-size:14px;font-weight:700;text-decoration:none;margin-bottom:12px">' + (isAr?'📧 فتح تطبيق البريد':'📧 Open Mail App') + '</a>' +
      '<button onclick="document.getElementById(\'contact-modal\').remove()" style="width:100%;background:none;border:none;color:var(--text-soft);font-size:14px;cursor:pointer;font-family:inherit;padding:8px">' + (isAr?'إغلاق':'Close') + '</button>' +
    '</div>';
  document.body.appendChild(div);
  hap.tap();
}
function showPaywall(){
  let pw=document.getElementById('pw');
  if(pw){ pw.remove(); pw=null; } // always rebuild so timeUntilMidnight() is fresh
  pw=document.createElement('div');pw.id='pw';pw.className='pw-wrap';
  pw.onclick=function(e){if(e.target===pw){pw.classList.remove('open');hap.tap()}};
  var features=['✨ '+(isAr?'رسائل AI غير محدودة':'Unlimited AI messages'),'👨‍🍳 '+(isAr?'وصفات وقوائم مشتريات':'Unlimited recipes & grocery lists'),'🌹 '+(isAr?'خطط خروجات غير محدودة':'Unlimited date plans'),'📖 '+(isAr?'ذكريات غير محدودة':'Unlimited memories'),'🏆 '+(isAr?'أوسمة وإنجازات حصرية':'Exclusive badges')];
  pw.innerHTML='<div class="pw-sheet"><div class="sheet-handle"></div><div style="text-align:center">'+
    '<div style="font-size:52px;margin-bottom:10px" class="float">👑</div>'+
    '<div style="font-family:\'Cormorant Garamond\',serif;font-size:26px;font-weight:700;color:var(--rose);margin-bottom:4px">أنا وياك Pro</div>'+
    '<div style="font-size:13px;color:var(--text-soft);margin-bottom:16px">'+(isAr?'استخدمت رسائلك اليوم. تتجدد خلال '+timeUntilMidnight()+' 🌙':'Daily free messages used. Resets in '+timeUntilMidnight()+' 🌙')+'</div>'+
    features.map(function(b){ return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);text-align:left;font-size:13px">'+b+'</div>'; }).join('')+
    '<div style="font-size:14px;color:var(--text-soft);margin-bottom:4px;margin-top:16px">'+(isAr?'عرض الإطلاق':'Launch offer')+'</div>'+
    '<div style="font-size:28px;font-weight:800;color:var(--rose);margin:12px 0 4px">'+(isAr?'':'AED ')+'29'+(isAr?' درهم':'')+'<span style="font-size:15px;font-weight:400;color:var(--text-soft)">/'+(isAr?'شهر':'month')+'</span></div>'+
    '<div style="font-size:14px;color:var(--text-soft);margin-bottom:16px">'+(isAr?'أو سنوي 290 درهم — وفر 17٪ · تجربة مجانية 7 أيام':'or annual AED 290 — save 17% · 7-day free trial')+'</div>'+
    '<button class="btn-gold" onclick="openPaddleCheckout(PADDLE_MONTHLY_PRICE)" style="display:block;width:100%;margin-bottom:10px;cursor:pointer;font-family:inherit;font-size:15px;padding:14px;border-radius:50px;border:none">'+(isAr?'ابدأ تجربتك المجانية 7 أيام 🚀':'Start 7-Day Free Trial 🚀')+'</button>'+
    '<button onclick="openPaddleCheckout(PADDLE_ANNUAL_PRICE)" style="display:block;width:100%;background:none;border:1px solid var(--gold);color:var(--gold);border-radius:50px;padding:12px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;margin-bottom:16px">'+(isAr?'السنوي 290 درهم — الأفضل قيمة 💛':'Annual AED 290 — Best Value 💛')+'</button>'+
    '<button onclick="document.getElementById(\'pw\').classList.remove(\'open\')" style="background:none;border:none;color:var(--text-soft);font-size:14px;cursor:pointer;font-family:inherit">'+(isAr?'لاحقاً':'Maybe later')+'</button>'+
    '</div></div>';
  document.body.appendChild(pw);
  pw.classList.add('open');hap.tap();
}

// ══════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════
function saveMood(m,el){LS.set('aw_mood',m);document.querySelectorAll('.mood-emoji').forEach(x=>x.classList.remove('selected'));el.classList.add('selected');const sl=getSecretLabel(m);hap.tap();T((isAr?'تم حفظ مزاجك 💕 ':'Mood saved! 💕 ')+(sl||m))}
function getStreak(){const c=LS.get('aw_checkins',[]);if(!c.length)return 0;let s=0;let d=new Date();for(let i=0;i<30;i++){if(c.some(ci=>ci.d===d.toDateString()))s++;else if(i>0)break;d.setDate(d.getDate()-1)}return s}
function streakDots(s){let h='';for(let i=6;i>=0;i--){const done=i<s,today=i===0;h+=`<span class="sdot ${today?'today':done?'done':'miss'}"></span>`}return h}
function dailyQuote(){const q=isAr?['الأسرة السعيدة تبنى على الحب والتفاهم يومياً.','القلب السليم يسكن في البيت المليء بالمحبة.','الحب الحقيقي يُبنى يوماً بيوم بالعطاء والاهتمام.','أقوى الأسر هي التي تواجه التحديات معاً.','كلمة طيبة تبني بيوتاً وتصلح قلوباً.']:['A happy family is built on love, trust, and daily effort. 💕','Small daily moments of connection make the strongest bonds.','Growing together is the greatest adventure you can share.','Kindness is the foundation of every happy home.','A relationship thrives when both partners feel truly seen. ✨'];return q[new Date().getDate()%q.length]}
function getOccasions(){const res=[];const today=new Date();today.setHours(0,0,0,0);const p=profile||{};if(p.ann){const a=new Date(p.ann);const next=new Date(today.getFullYear(),a.getMonth(),a.getDate());if(next<today)next.setFullYear(today.getFullYear()+1);res.push({n:isAr?'ذكرى الزواج':'Anniversary',em:'💍',d:Math.ceil((next-today)/864e5),dateStr:next.toLocaleDateString()})}occasions.forEach(o=>{if(!o.d)return;const d=new Date(o.d);const next=new Date(today.getFullYear(),d.getMonth(),d.getDate());if(next<today)next.setFullYear(today.getFullYear()+1);res.push({n:o.n,em:o.e||'🎉',d:Math.ceil((next-today)/864e5),dateStr:next.toLocaleDateString()})});return res.sort((a,b)=>a.d-b.d)}
function habitStreak(h){const c=h.c||[];let s=0;let d=new Date();for(let i=0;i<30;i++){if(c.includes(d.toDateString()))s++;else if(i>0)break;d.setDate(d.getDate()-1)}return s}

// ── 5D FEATURES ──────────────────────────────────────────────────────────────

function getOnThisDay(){
  var today=new Date(),mm=today.getMonth(),dd=today.getDate(),yr=today.getFullYear(),found=[];
  memories.forEach(function(m){
    if(!m.date)return;
    var d=new Date(m.date);
    if(d.getMonth()===mm&&d.getDate()===dd&&d.getFullYear()<yr)
      found.push({mem:m,yearsAgo:yr-d.getFullYear()});
  });
  var p=profile||{};
  if(p.ann){var a=new Date(p.ann);if(a.getMonth()===mm&&a.getDate()===dd&&a.getFullYear()<yr)
    found.push({mem:{title:isAr?'ذكرى الزواج':'Anniversary',em:'💍',note:''},yearsAgo:yr-a.getFullYear()});}
  return found;
}

function showMilestoneCelebration(days){
  var msg=isAr?'🎉 '+days+' يوم متواصل!\nأنتما رائعان 💕':'🎉 '+days+' day streak!\nYou two are amazing 💕';
  var icon=days>=100?'🏆':days>=30?'💎':'⭐';
  var div=document.createElement('div');
  div.style.cssText='position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) scale(.8);background:linear-gradient(135deg,#C9954A,#E8849A);color:#fff;border-radius:24px;padding:32px 40px;text-align:center;z-index:9999;box-shadow:0 20px 60px rgba(0,0,0,.35);font-family:inherit;animation:milestoneIn .45s cubic-bezier(.175,.885,.32,1.275) forwards';
  div.innerHTML='<div style="font-size:52px;margin-bottom:12px">'+icon+'</div>'+
    '<div style="font-size:17px;font-weight:800;line-height:1.5;white-space:pre-line">'+msg+'</div>'+
    '<button onclick="this.parentNode.remove()" style="margin-top:20px;background:rgba(255,255,255,.22);border:none;color:#fff;padding:10px 24px;border-radius:20px;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit">'+(isAr?'شكراً 💕':'Awesome! 💕')+'</button>';
  document.body.appendChild(div);
  hap.success();
  setTimeout(function(){if(div.parentNode)div.remove();},7000);
}

function checkStreakMilestone(streak){
  var last=LS.get('aw_streak_milestone',0);
  var milestones=[7,30,100];
  var hit=milestones.slice().reverse().find(function(m){return streak>=m&&last<m;});
  if(hit){LS.set('aw_streak_milestone',hit);setTimeout(function(){showMilestoneCelebration(hit);},900);}
}

function scheduleRitualPush(){
  if(!('Notification' in window)||Notification.permission!=='granted')return;
  var last=LS.get('aw_ritual_ts',0);
  if(Date.now()-last<23*3600*1000)return;
  LS.set('aw_ritual_ts',Date.now());
  var now=new Date();
  var target=new Date(now.getFullYear(),now.getMonth(),now.getDate(),20,30,0);
  if(target<=now)target.setDate(target.getDate()+1);
  var ms=target-now;
  setTimeout(function(){
    try{new Notification(isAr?'وقت إضافي معاً 💕':'Time together tonight 💕',{
      body:isAr?'ماذا تخططان الليلة؟ افتحا التطبيق 🌹':'What are you doing together tonight? Open the app 🌹',
      icon:'./icons/icon-192.png',badge:'./icons/icon-192.png'
    });}catch(e){}
  },ms);
}
function genCode(){return Math.random().toString(36).substr(2,6).toUpperCase()}
function getCode(){if(!profile)return'------';if(!profile.code){profile.code=genCode();LS.set('aw_profile',profile)}return profile.code}
function copyCode(){navigator.clipboard?.writeText(getCode());hap.success();T(isAr?'تم نسخ الكود! 📋':'Code copied! 📋')}
function saveKey(){
  const k=document.getElementById('ak-in')?.value.trim();
  if(!k){T(isAr?'أدخل المفتاح':'Enter key');return}
  LS.set('aw_apikey',k);hap.success();
  T(isAr?'تم حفظ المفتاح! ✨ رسائل غير محدودة':'Key saved! ✨ Unlimited messages');
  showTab('profile');
}
function saveProxy(){
  const u=document.getElementById('proxy-in')?.value.trim();
  if(!u){T(isAr?'أدخل رابط الـ Proxy':'Enter Proxy URL');return}
  if(!u.startsWith('http')){T(isAr?'الرابط غير صحيح':'Invalid URL');hap.error();return}
  LS.set('aw_proxy_url',u);hap.success();
  T(isAr?'تم حفظ الـ Proxy! 🔒 AI آمن ومخفي':'Proxy saved! 🔒 AI is now secure');
  showTab('profile');
}
function activateAdmin(){
  const code=prompt(isAr?'أدخل رمز المؤسس:':'Enter founder code:');
  if(code===ADMIN_TOKEN){
    LS.set('aw_admin',ADMIN_TOKEN);
    hap.celebrate();
    T('👑 Admin Mode activated!',3000);
    showTab('profile');
  } else if(code!==null){
    T(isAr?'رمز غير صحيح':'Wrong code');hap.error();
  }
}
async function toggleBioLock(){
  const enabled=LS.get('aw_bio_enabled',false);
  if(enabled){LS.set('aw_bio_enabled',false);hap.tap();T(isAr?'تم إيقاف القفل البيومتري':'Biometric lock disabled');showTab('profile');return}
  const supported=await Bio.isSupported();
  if(!supported){T(isAr?'جهازك لا يدعم البيومتري':'Your device does not support biometrics',3000);return}
  T(isAr?'جارٍ التسجيل...':'Registering...');
  const ok=await Bio.register();
  if(ok){hap.celebrate();T(isAr?'🔐 تم تفعيل القفل البيومتري!':'🔐 Biometric lock enabled!');showTab('profile')}
  else{hap.error();T(isAr?'فشل التسجيل. حاول مجدداً.':'Registration failed. Try again.',3000)}
}
function shareApp(){const text=isAr?`💑 أنا وياك — تطبيق الأزواج العربي\n\n👨‍🍳 نطبخ معاً + محرك مزاج\n💬 مدرب AI للعلاقات\n🎮 اختبار أزواج + لغة الحب\n🌹 خروجات + AI مخطط\n📖 ذكريات + مناسبات\n🔒 لغتنا السرية\n🎲 وش نسوي الليلة؟\n\nhttps://anawyak.app 💕`:`💑 Ana Wyak — The Arab Couples App\n\n👨‍🍳 Cook Together + Mood Engine\n💬 AI Relationship Coach\n🎮 Couples Quiz + Love Language\n🌹 Date Ideas + AI Planner\n📖 Memories + Occasions\n🔒 Secret Language\n🎲 What Tonight?\n\nhttps://anawyak.app 💕`;if(navigator.share)navigator.share({title:'أنا وياك Ana Wyak',text});else window.open('https://wa.me/?text='+encodeURIComponent(text),'_blank');hap.tap()}

// Install Banner
function showInstallBanner(){if(LS.get('aw_installed'))return;LS.set('aw_installed',true);const b=document.createElement('div');b.style.cssText='position:fixed;bottom:max(80px,calc(70px + env(safe-area-inset-bottom)));left:16px;right:16px;background:var(--card);border:1px solid rgba(232,132,154,.3);border-radius:18px;padding:14px 16px;display:flex;align-items:center;gap:12px;z-index:200;animation:fadeUp .4s ease;max-width:448px;margin:0 auto;box-shadow:0 8px 32px var(--shadow)';b.innerHTML=`<div style="font-size:28px;line-height:1">📱</div><div style="flex:1"><div style="font-size:13px;font-weight:700;color:var(--text)">Add أنا وياك to Home Screen</div><div style="font-size:11px;color:var(--text-soft)">No App Store needed · بدون آب ستور 💕</div></div><button onclick="this.parentElement.remove();hap.tap()" style="background:var(--rose);color:#fff;border:none;border-radius:12px;padding:8px 14px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">${isAr?'تثبيت':'Install'}</button><button onclick="this.parentElement.remove()" style="background:none;border:none;color:var(--text-soft);font-size:20px;cursor:pointer;line-height:1">×</button>`;document.body.appendChild(b);setTimeout(()=>{if(b.parentElement)b.remove()},9000)}

// Register Service Worker
if('serviceWorker' in navigator){window.addEventListener('load',()=>{navigator.serviceWorker.register('./sw.js').catch(()=>{})})}

// ══════════════════════════════════════════════════
//  BIOMETRIC ENGINE (WebAuthn)
// ══════════════════════════════════════════════════
const Bio = {
  isSupported: async ()=>{
    try{return !!(window.PublicKeyCredential&&await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())}catch{return false}
  },
  register: async ()=>{
    if(!await Bio.isSupported())return false;
    try{
      const ch=crypto.getRandomValues(new Uint8Array(32));
      const uid=crypto.getRandomValues(new Uint8Array(16));
      await navigator.credentials.create({publicKey:{challenge:ch,rp:{name:'Ana Wyak',id:window.location.hostname},user:{id:uid,name:'partner',displayName:'Ana Wyak'},pubKeyCredParams:[{alg:-7,type:'public-key'}],authenticatorSelection:{authenticatorAttachment:'platform',userVerification:'required'},timeout:60000}});
      LS.set('aw_bio_enabled',true);return true;
    }catch{return false}
  },
  authenticate: async ()=>{
    if(!LS.get('aw_bio_enabled',false))return true;
    if(!await Bio.isSupported())return true;
    try{
      const ch=crypto.getRandomValues(new Uint8Array(32));
      await navigator.credentials.get({publicKey:{challenge:ch,timeout:60000,userVerification:'required'}});
      return true;
    }catch{return false}
  }
};

async function bioUnlock(){
  const btn=document.getElementById('bio-unlock-btn');
  const status=document.getElementById('bio-status');
  if(btn){btn.textContent='⏳ Verifying...';btn.disabled=true}
  const ok=await Bio.authenticate();
  if(ok){if(status)status.textContent='✅ Identity verified';hap.success();hideLockScreen()}
  else{if(btn){btn.textContent='🔓 Try Again';btn.disabled=false}if(status)status.textContent='❌ Authentication failed. Try again.';hap.error()}
}
function bioSkip(){hideLockScreen()}
function showLockScreen(){const ls=document.getElementById('lock-screen');if(ls)ls.style.display='flex'}
function hideLockScreen(){const ls=document.getElementById('lock-screen');if(ls)ls.style.display='none'}

// Lock on app hide
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='hidden'&&LS.get('aw_bio_enabled',false))LS.set('aw_bio_needs_unlock',true);
  if(document.visibilityState==='visible'&&LS.get('aw_bio_needs_unlock',false)){LS.set('aw_bio_needs_unlock',false);if(LS.get('aw_bio_enabled',false))showLockScreen()}
});

// ══════════════════════════════════════════════════
//  🧪 FEATURE TEST PANEL — tap header 5× or ?test=1
// ══════════════════════════════════════════════════
let _tapCount=0,_tapTimer=null;
document.addEventListener('DOMContentLoaded',()=>{
  checkPaddleSuccess();
  initPaddle();
  setupSWUpdateDetection();
  const _partnerCode=LS.get('aw_partner_code','');
  if(_partnerCode) startPartnerSync(_partnerCode);
  setTimeout(()=>{const hdr=document.querySelector('.app-header');if(hdr)hdr.addEventListener('click',()=>{_tapCount++;clearTimeout(_tapTimer);_tapTimer=setTimeout(()=>_tapCount=0,1200);if(_tapCount>=5){_tapCount=0;openTestPanel()}})},3000);
  if(new URLSearchParams(window.location.search).get('test')==='1')setTimeout(openTestPanel,3000);
  // Auto-activate admin mode via URL param (founder link)
  const _founderParam=new URLSearchParams(window.location.search).get('founder');
  if(_founderParam===ADMIN_TOKEN){
    LS.set('aw_admin',ADMIN_TOKEN);
    history.replaceState(null,'',window.location.pathname);
    setTimeout(()=>{T(isAr?'مرحباً بك يا مؤسس 👑':'Welcome, founder 👑');hap.celebrate();},800);
  }
});

function openTestPanel(){
  let p=document.getElementById('test-panel');
  if(!p){p=document.createElement('div');p.id='test-panel';p.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.97);z-index:9000;overflow-y:auto;font-family:monospace;padding:20px;color:#fff';document.body.appendChild(p)}
  const tests=[
    {id:'t-home',  label:'🏠 Home Tab — hero + countdown + mood',  fn:()=>testTab('home','home')},
    {id:'t-coach', label:'💬 Coach Tab — chat + chips',             fn:()=>testTab('coach','coach')},
    {id:'t-cook',  label:'👨‍🍳 Cook — Chef Mood + grocery + timer',  fn:()=>testTab('cook','cook')},
    {id:'t-dates', label:'🌹 Dates — places render (BUG FIX TEST)', fn:()=>testTab('dates','dates')},
    {id:'t-mem',   label:'📖 Memories — occasions + timeline',      fn:()=>testTab('memories','mem')},
    {id:'t-prof',  label:'👤 Profile — badges + bio toggle',        fn:()=>testTab('profile','prof')},
    {id:'t-tonight',label:'🎲 Tonight Decider — sheet opens',       fn:()=>openTonight()},
    {id:'t-quiz',  label:'🎮 Quiz sheet — 3 modes',                 fn:()=>openQuiz()},
    {id:'t-habit', label:'🎯 Add Habit — sheet + quick add',        fn:()=>openAddHabit()},
    {id:'t-occ',   label:'⏰ Add Occasion — sheet opens',            fn:()=>openAddOcc()},
    {id:'t-grat',  label:'✍️ Gratitude entry sheet',                fn:()=>openGrat()},
    {id:'t-ai',    label:'🤖 AI API — live call (uses 1 credit)',   fn:()=>testAILive()},
    {id:'t-grocery',label:'🛒 Grocery — add + toggle + clear',      fn:()=>testGrocery()},
    {id:'t-mood',  label:'😊 Mood save + secret language display',  fn:()=>testMood()},
    {id:'t-dark',  label:'🌙 Dark mode toggle',                     fn:()=>toggleTheme()},
    {id:'t-lang',  label:'🌐 AR↔EN language switch',                fn:()=>testLang()},
    {id:'t-pw',    label:'💳 Paywall sheet',                        fn:()=>showPaywall()},
    {id:'t-export',label:'📥 JSON data export download',            fn:()=>exportData()},
    {id:'t-credits',label:'💬 Credits badge display',               fn:()=>{updateCredits();tlog('t-credits','Credits: '+creditsLeft()+'/'+FREE_LIMIT)}},
    {id:'t-pair',  label:'🔗 Pairing modal',                        fn:()=>document.getElementById('pair-modal').classList.add('open')},
    {id:'t-badge', label:'🏆 Badge overlay',                        fn:()=>document.getElementById('ach-overlay').classList.add('open')},
    {id:'t-bio',   label:'🔐 Biometric lock screen',                fn:()=>showLockScreen()},
    {id:'t-sw',    label:'⚙️ Service Worker status',                fn:()=>testSW()},
    {id:'t-LS',    label:'💾 LocalStorage read/write',              fn:()=>testLS()},
    {id:'t-haptic',label:'📳 All 4 haptic patterns',                fn:()=>testHaptics()},
    {id:'t-share', label:'📤 Web Share API',                        fn:()=>shareApp()},
  ];
  window._tests=tests;
  p.innerHTML=`
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;border-bottom:1px solid rgba(232,132,154,.3);padding-bottom:12px">
    <div><div style="color:#E8849A;font-size:15px;font-weight:700">🧪 Ana Wyak v4 · Test Panel</div>
    <div style="color:rgba(255,255,255,.35);font-size:9px;margin-top:3px">Tap header 5× · ?test=1 in URL</div></div>
    <div style="display:flex;gap:6px">
      <button onclick="runAllTests()" style="background:#C9954A;color:#fff;border:none;border-radius:6px;padding:6px 10px;font-size:10px;font-weight:700;cursor:pointer;font-family:monospace">▶ All</button>
      <button onclick="document.getElementById('test-panel').remove()" style="background:#E8849A;color:#fff;border:none;border-radius:6px;padding:6px 10px;font-size:10px;font-weight:700;cursor:pointer;font-family:monospace">✕</button>
    </div>
  </div>
  <div style="font-size:9px;color:rgba(255,255,255,.35);margin-bottom:12px;line-height:1.7">
    Auth: ${profile?'✅ '+profile.n1:'❌ Not logged in'} · Credits: ${creditsLeft()}/${FREE_LIMIT} · Lang: ${isAr?'AR🇦🇪':'EN🇬🇧'} · Dark: ${document.body.classList.contains('dark')?'🌙':'☀️'} · Bio: ${LS.get('aw_bio_enabled',false)?'🔐 On':'Off'} · SW: ${'serviceWorker' in navigator?'✅':'❌'} · Groceries: ${grocery.length} items
  </div>
  <div style="display:grid;gap:5px">${tests.map(t=>`
    <div id="${t.id}-row" style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:7px;padding:9px 11px;display:flex;align-items:center;gap:9px;cursor:pointer" onclick="runTest('${t.id}')">
      <div id="${t.id}-icon" style="width:18px;height:18px;border-radius:50%;border:1px solid rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-size:8px;flex-shrink:0;color:rgba(255,255,255,.25)">○</div>
      <div style="flex:1"><div style="font-size:10px;color:rgba(255,255,255,.78)">${t.label}</div>
      <div id="${t.id}-msg" style="font-size:8px;color:rgba(255,255,255,.28);margin-top:1px">Not run</div></div>
    </div>`).join('')}
  </div>
  <div id="test-log" style="margin-top:12px;background:rgba(0,0,0,.5);border-radius:7px;padding:10px;font-size:8px;color:rgba(255,255,255,.4);max-height:100px;overflow-y:auto;border:1px solid rgba(255,255,255,.05)">Log ready...</div>`;
}

function tlog(id,msg,pass=true){
  const ic=document.getElementById(id+'-icon'),me=document.getElementById(id+'-msg'),ro=document.getElementById(id+'-row'),lg=document.getElementById('test-log');
  if(ic){ic.textContent=pass?'✓':'✗';ic.style.color=pass?'#7BAE8E':'#EF4444';ic.style.borderColor=pass?'#7BAE8E':'#EF4444';ic.style.background=pass?'rgba(123,174,142,.2)':'rgba(239,68,68,.15)'}
  if(me){me.textContent=msg;me.style.color=pass?'#7BAE8E':'#EF4444'}
  if(ro)ro.style.borderColor=pass?'rgba(123,174,142,.25)':'rgba(239,68,68,.25)';
  if(lg){lg.innerHTML+=`<div style="color:${pass?'#7BAE8E':'#EF4444'}">${new Date().toLocaleTimeString()} ${id}: ${msg}</div>`;lg.scrollTop=lg.scrollHeight}
}
function runTest(id){
  const t=window._tests?.find(x=>x.id===id);if(!t)return;
  ['tn-sh','quiz-sh','hab-sh','occ-sh','grat-sh','recipe-sh','dplan-sh','secret-add-sh'].forEach(s=>closeSheet(s));
  document.querySelectorAll('.overlay.open,.pw-wrap.open').forEach(o=>o.classList.remove('open'));
  try{t.fn();tlog(id,'✅ Ran')}catch(e){tlog(id,'❌ '+e.message,false)}
}
async function runAllTests(){
  const lg=document.getElementById('test-log');if(lg)lg.innerHTML='<div style="color:#C9954A">▶ Running all '+window._tests.length+' tests...</div>';
  for(const t of window._tests||[]){
    await new Promise(r=>setTimeout(r,200));
    ['tn-sh','quiz-sh','hab-sh'].forEach(s=>closeSheet(s));
    document.querySelectorAll('.overlay.open,.pw-wrap.open').forEach(o=>o.classList.remove('open'));
    try{t.fn();tlog(t.id,'✅')}catch(e){tlog(t.id,'❌ '+e.message,false)}
  }
  const lg2=document.getElementById('test-log');if(lg2)lg2.innerHTML+='<div style="color:#C9954A;margin-top:4px">═══ Done ═══</div>';
}

// Test helpers
function testTab(id,short){
  const p=document.getElementById('test-panel');if(p)p.style.display='none';
  showTab(id);
  setTimeout(()=>{if(p)p.style.display='block';tlog('t-'+short,'Rendered ✅')},1000);
}
async function testAILive(){const r=await callAI([{role:'user',content:'Say OK in 3 words'}]);const ok=r&&r.length>1&&!r.includes('Connection');tlog('t-ai',ok?'✅ '+r.substring(0,30):'❌ Failed',ok)}
function testGrocery(){grocery=[{id:Date.now(),item:'Test Onions 🧅',cat:'Produce',checked:false}];LS.set('aw_grocery',grocery);showTab('cook');tlog('t-grocery','Added + opened cook ✅')}
function testMood(){LS.set('aw_mood','🥰');showTab('home');tlog('t-mood','Mood set ✅')}
function testLang(){toggleLang();setTimeout(()=>{toggleLang();tlog('t-lang','AR↔EN ✅')},600)}
function testLS(){try{LS.set('aw_test','ok_'+Date.now());const v=LS.get('aw_test','fail');const ok=v.startsWith('ok_');tlog('t-LS',ok?'R/W ✅':'Fail ❌',ok)}catch(e){tlog('t-LS','❌ '+e.message,false)}}
function testHaptics(){if(!navigator.vibrate){tlog('t-haptic','Not supported',false);return}[hap.tap,hap.success,hap.celebrate,hap.error].forEach((fn,i)=>setTimeout(fn,i*400));tlog('t-haptic','4 patterns ✅')}
function testSW(){const ok='serviceWorker' in navigator;tlog('t-sw',ok?'Available ✅':'Not supported',ok)}




// ══════════════════════════════════════════════════
//  TOAST NOTIFICATION  (T is used everywhere)
// ══════════════════════════════════════════════════
var _tToastTimeout = null;
function T(msg, dur) {
  dur = dur || 2500;
  var el = document.getElementById('toast');
  if(!el) return;
  clearTimeout(_tToastTimeout);
  el.textContent = msg;
  el.style.display = 'block';
  _tToastTimeout = setTimeout(function(){ el.style.display = 'none'; }, dur);
}

// ══════════════════════════════════════════════════
//  SHEET SYSTEM  (overlay bottom sheets)
// ══════════════════════════════════════════════════
var _sheetsCache = {};
function getSheet(id) {
  var existing = document.getElementById(id);
  if(existing) { _sheetsCache[id] = existing; return existing; }
  var wrap = document.createElement('div');
  wrap.id = id;
  wrap.className = 'overlay';
  wrap.innerHTML = '<div class="sheet"></div>';
  wrap.addEventListener('click', function(e){ if(e.target === wrap) closeSheet(id); });
  document.body.appendChild(wrap);
  _sheetsCache[id] = wrap;
  return wrap;
}
function closeSheet(id) {
  var el = document.getElementById(id) || _sheetsCache[id];
  if(el) el.classList.remove('open');
}

// ══════════════════════════════════════════════════
//  HOME TAB RENDERER
// ══════════════════════════════════════════════════
function rHome(el) {
  var p = profile || {};
  var streak = getStreak();
  // Check streak milestones after render
  setTimeout(function(){ checkStreakMilestone(streak); }, 400);
  // Schedule evening ritual push
  scheduleRitualPush();
  var today = new Date().toDateString();
  // record daily check-in for streak
  var checkins = LS.get('aw_checkins', []);
  if(!checkins.some(function(c){ return c.d === today; })) {
    checkins.push({d: today});
    LS.set('aw_checkins', checkins);
  }
  var occasions = getOccasions();
  var nextOcc = occasions.length ? occasions[0] : null;
  var savedMood = LS.get('aw_mood', '');
  var moods = ['😊','🥰','😴','💪','😤','🥺','🎉','💑'];
  var h7 = (LS.get('aw_grat',{days:[]}).days||[]).length >= 7;
  var h30 = streak >= 30;
  var h10 = memories.length >= 10;

  var ritualPrompt = '';
  var targetTab = 'dates';
  var secretPreview = secretLang.slice(0,2).map(function(s){
    return '<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid rgba(232,132,154,.1);font-size:13px;color:var(--text);"><span style="font-size:22px">' + s.emoji + '</span><span style="flex:1;color:var(--text-mid)">' + esc(s.meaning) + '</span></div>';
  }).join('');
  var badgeSummary = '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
    '<span class="chip" style="padding:8px 12px;font-size:12px">🤝 ' + (h7? (isAr?'مفعل':'On') : (isAr?'7 أيام':'7d')) + '</span>' +
    '<span class="chip" style="padding:8px 12px;font-size:12px">🔥 ' + (h30? (isAr?'مفعل':'On') : (isAr?'30 يوم':'30d')) + '</span>' +
    '<span class="chip" style="padding:8px 12px;font-size:12px">📖 ' + (h10? (isAr?'مفعل':'On') : (isAr?'10 ذكريات':'10 mem')) + '</span>' +
  '</div>';
  if(p.firstWish){
    var wishLabel = '';
    var wishDesc = '';
    var wishAction = '';
    if(p.firstWish === 'Date'){
      wishLabel = isAr ? 'خطة موعد فاخرة' : 'Luxury date ritual';
      wishDesc = isAr ? 'ابدأ بخطتك الأولى لليلة مميزة' : 'Begin with your first special night plan';
      wishAction = isAr ? 'استعرض الخطوات' : 'Open Date Plan';
      targetTab = 'dates';
    } else if(p.firstWish === 'Cook'){
      wishLabel = isAr ? 'خطة طبخ رومانسية' : 'Romantic cooking ritual';
      wishDesc = isAr ? 'اطبخوا معاً وجبة تُشعل الوصال' : 'Cook together and spark connection';
      wishAction = isAr ? 'ابدأ الطبخ' : 'Start Cooking';
      targetTab = 'cook';
    } else if(p.firstWish === 'Memories'){
      wishLabel = isAr ? 'طقس الذكريات' : 'Memories ritual';
      wishDesc = isAr ? 'احتفظوا بلحظة خاصة في دفتر القصص' : 'Capture a special moment in your story book';
      wishAction = isAr ? 'تسجيل الذكرى' : 'Save the Memory';
      targetTab = 'memories';
    }
    ritualPrompt =
      '<div class="card" style="padding:20px;margin-bottom:20px;background:linear-gradient(180deg,rgba(255,255,255,.16),rgba(255,255,255,.05));border:1px solid rgba(201,149,74,.16);box-shadow:0 14px 40px rgba(0,0,0,.05);">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:14px">' +
          '<div>' +
            '<div style="font-size:13px;font-weight:800;color:var(--gold-light);text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px">' + (isAr ? 'طقسك الأول' : 'Your First Ritual') + '</div>' +
            '<div style="font-size:18px;font-weight:700;color:var(--rose);margin-bottom:8px">' + wishLabel + '</div>' +
            '<div style="font-size:13px;color:var(--text-mid);line-height:1.6">' + wishDesc + '</div>' +
          '</div>' +
          '<div style="font-size:30px">' + (p.firstWish === 'Date' ? '🌹' : p.firstWish === 'Cook' ? '👩‍🍳' : '📖') + '</div>' +
        '</div>' +
        '<button class="btn-gold" onclick="showTab(\'' + targetTab + '\')" style="width:100%;padding:14px;font-size:14px;font-weight:800">' + wishAction + '</button>' +
      '</div>';
  } else {
    ritualPrompt =
      '<div class="card" style="padding:20px;margin-bottom:20px;background:linear-gradient(180deg,rgba(255,255,255,.12),rgba(255,255,255,.02));border:1px solid rgba(232,132,154,.16);">' +
        '<div style="font-size:14px;font-weight:800;color:var(--text);margin-bottom:8px">' + (isAr ? 'المرحلة التالية' : 'Next step in your journey') + '</div>' +
        '<div style="font-size:16px;font-weight:700;color:var(--rose);margin-bottom:10px">' + (isAr ? 'اختر طقساً لتبدأ به' : 'Choose a ritual to begin') + '</div>' +
        '<div style="font-size:13px;color:var(--text-soft);line-height:1.7;margin-bottom:12px">' + (isAr ? 'من خطة موعد إلى طبخ مشترك أو ذكرى خاصة، كل طريق يخلق لحظة فريدة.' : 'From date plans to shared cooking or memory rituals, every path creates a unique moment.') + '</div>' +
        '<button class="btn-rose" onclick="showTab(\'dates\')" style="width:100%;padding:14px;font-size:14px;font-weight:800">' + (isAr ? 'ابدأ بخطة موعد' : 'Start with a date idea') + '</button>' +
      '</div>';
  }

  // ON THIS DAY
  var onThisDay = getOnThisDay();
  var onThisDayCard = '';
  if (onThisDay.length) {
    var m0 = onThisDay[0];
    var yearsLabel = isAr ? ('منذ ' + m0.yearsAgo + (m0.yearsAgo === 1 ? ' سنة' : ' سنوات')) : (m0.yearsAgo + (m0.yearsAgo === 1 ? ' year ago' : ' years ago'));
    onThisDayCard =
      '<div class="card" onclick="showTab(\'memories\')" style="padding:18px;margin-bottom:16px;cursor:pointer;background:linear-gradient(135deg,rgba(201,149,74,.12),rgba(232,132,154,.08));border:1px solid rgba(201,149,74,.28);animation:fadeUp .4s ease">' +
        '<div style="display:flex;align-items:center;gap:12px">' +
          '<div style="font-size:36px">' + (m0.mem.em || '📸') + '</div>' +
          '<div style="flex:1">' +
            '<div style="font-size:11px;font-weight:800;color:var(--gold-light);text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px">' +
              (isAr ? '🕰️ في مثل هذا اليوم' : '🕰️ On This Day') +
            '</div>' +
            '<div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:4px">' + esc(m0.mem.title) + '</div>' +
            '<div style="font-size:12px;color:var(--text-soft)">' + yearsLabel + '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  // PROMINENT STREAK HERO (milestone-aware)
  var streakColor = streak >= 100 ? '#FFD700' : streak >= 30 ? '#C9954A' : streak >= 7 ? 'var(--rose)' : 'var(--text-mid)';
  var streakIcon = streak >= 100 ? '🏆' : streak >= 30 ? '💎' : streak >= 7 ? '🔥' : '✨';
  var streakMsg = '';
  if (streak >= 100) streakMsg = isAr ? 'أسطوريان! 💕' : 'Legendary! 💕';
  else if (streak >= 30) streakMsg = isAr ? 'شهر من الحب 💎' : 'A month of love 💎';
  else if (streak >= 7) streakMsg = isAr ? 'أسبوع رائع 🔥' : 'Amazing week 🔥';
  else if (streak >= 1) streakMsg = isAr ? 'استمرا 💪' : 'Keep going 💪';
  else streakMsg = isAr ? 'ابدأا اليوم ✨' : 'Start today ✨';

  var streakHero =
    '<div class="card" style="padding:20px;margin-bottom:16px;text-align:center;animation:fadeUp .35s ease;border:1px solid rgba(201,149,74,.2)">' +
      '<div style="font-size:48px;line-height:1">' + streakIcon + '</div>' +
      '<div style="font-size:42px;font-weight:800;color:' + streakColor + ';font-family:\'Cormorant Garamond\',serif;margin:4px 0">' + streak + '</div>' +
      '<div style="font-size:12px;font-weight:700;color:var(--text-soft);text-transform:uppercase;letter-spacing:.1em">' + (isAr ? 'يوم متواصل' : 'Day Streak') + '</div>' +
      '<div style="font-size:13px;color:var(--text-mid);margin:6px 0 10px">' + streakMsg + '</div>' +
      '<div style="display:flex;justify-content:center;gap:5px">' + streakDots(streak) + '</div>' +
      (streak > 0 ?
        '<div style="margin-top:10px;font-size:11px;color:var(--text-soft)">' +
          (isAr ? 'الهدف التالي: ' : 'Next milestone: ') +
          (streak < 7 ? '7 🔥' : streak < 30 ? '30 💎' : streak < 100 ? '100 🏆' : (isAr ? 'أنتما أبطال! 🏆' : 'You\'re legends! 🏆')) +
        '</div>' : '') +
    '</div>';

  el.innerHTML = '<div class="container" style="padding-top:20px">' +

  onThisDayCard +
  streakHero +

  // HERO CARD
  '<div class="card-rose" style="padding:18px;margin-bottom:20px;animation:fadeUp .5s ease">' +
    '<div style="text-align:center;margin-bottom:8px">' +
      '<div style="font-size:13px;color:var(--text-soft);margin-bottom:2px">' +
        (isAr ? 'أهلاً، ' : 'Welcome back, ') +
        '<span style="font-weight:800;color:var(--rose)">' + (p.n1 || (isAr?'حبيبي':'Habibi')) + '</span>' +
        (p.n2 ? ' & ' + p.n2 : '') + ' 💕' +
      '</div>' +
      '<div style="font-size:13px;font-style:italic;color:var(--text-mid);line-height:1.5">"' + dailyQuote() + '"</div>' +
    '</div>' +
    '<div style="display:flex;justify-content:center;gap:4px;flex-wrap:wrap;margin-bottom:10px">' +
      moods.map(function(m){ return '<span class="mood-emoji ' + (savedMood===m?'selected':'') + '" onclick="saveMood(\'' + m + '\',this)">' + m + '</span>'; }).join('') +
    '</div>' +
    '<div style="text-align:center;font-size:12px;color:var(--text-soft);margin-bottom:10px">' + (isAr?'خطوة صغيرة، تأثير كبير الليلة':'One small step, a big difference tonight') + '</div>' +
    '<button class="btn-gold" onclick="showTab(\'' + targetTab + '\')" style="margin:0 auto;max-width:240px;padding:12px 16px;font-size:14px;font-weight:800">' +
      (p.firstWish ? (isAr?'ابدأ طقسك الأول':'Start your first ritual') : (isAr?'اكتشف طقسك الأول':'Discover your first ritual')) +
    '</button>' +
  '</div>' +

  ritualPrompt +

  '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:20px">' +
    '<div class="card tap" onclick="showTab(\'memories\')" style="padding:16px;min-height:150px;display:flex;flex-direction:column;justify-content:space-between;">' +
      '<div>' +
        '<div style="font-size:14px;font-weight:800;color:var(--text);margin-bottom:10px">🎉 ' + (isAr?'المناسبات':'Occasions') + '</div>' +
        (nextOcc ?
          '<div style="font-size:22px;font-weight:700;color:var(--rose);margin-bottom:6px">' + nextOcc.d + '</div>' +
          '<div style="font-size:12px;color:var(--text-mid);line-height:1.6">' + nextOcc.n + ' · ' + (isAr?'باقي':'left') + '</div>' :
          '<div style="font-size:14px;color:var(--text-mid);line-height:1.6">' + (isAr?'لم تضاف بعد':'No occasion added yet') + '</div>'
        ) +
      '</div>' +
      '<button class="btn-ghost" style="padding:10px;font-size:12px;">' + (isAr?'عرض المناسبات':'View Occasions') + '</button>' +
    '</div>' +

    '<div class="card tap" onclick="showTab(\'profile\')" style="padding:16px;min-height:150px;display:flex;flex-direction:column;justify-content:space-between;">' +
      '<div>' +
        '<div style="font-size:14px;font-weight:800;color:var(--text);margin-bottom:10px">🔒 ' + (isAr?'لغة سرية':'Secret Language') + '</div>' +
        '<div style="font-size:12px;color:var(--text-soft);margin-bottom:10px">' + (isAr?'رمز خاص بينكما فقط':'Private emoji meanings for you two') + '</div>' +
        secretPreview +
      '</div>' +
      '<button class="btn-ghost" style="padding:10px;font-size:12px;">' + (isAr?'تحرير اللغة':'Edit Language') + '</button>' +
    '</div>' +

    '<div class="card tap" onclick="showTab(\'profile\')" style="padding:16px;min-height:150px;display:flex;flex-direction:column;justify-content:space-between;">' +
      '<div>' +
        '<div style="font-size:14px;font-weight:800;color:var(--text);margin-bottom:10px">🏆 ' + (isAr?'الأوسمة':'Badges') + '</div>' +
        '<div style="font-size:12px;color:var(--text-soft);margin-bottom:10px">' + (isAr?'شاهد إنجازاتكما المشتركة':'See your shared achievements') + '</div>' +
        badgeSummary +
      '</div>' +
      '<button class="btn-ghost" style="padding:10px;font-size:12px;">' + (isAr?'عرضها':'View Badges') + '</button>' +
    '</div>' +

    '<div class="card tap" onclick="openQuiz()" style="padding:16px;min-height:150px;display:flex;flex-direction:column;justify-content:space-between;">' +
      '<div>' +
        '<div style="font-size:14px;font-weight:800;color:var(--text);margin-bottom:10px">🎮 ' + (isAr?'اختبار الأزواج':'Couples Quiz') + '</div>' +
        '<div style="font-size:12px;color:var(--text-soft);line-height:1.6">' + (isAr?'اختبر معرفتك بشريكك':'Test how well you know each other') + '</div>' +
      '</div>' +
      '<button class="btn-ghost" style="padding:10px;font-size:12px;">' + (isAr?'ابدأ الآن':'Start Now') + '</button>' +
    '</div>' +
  '</div>' +

  // COUNTDOWN TO NEXT OCCASION
  (nextOcc ?
  '<div class="countdown-card ' + (nextOcc.d<=7?'urgent':'') + '" style="margin-bottom:20px;flex-direction:column;text-align:center;justify-content:center;padding:16px">' +
    '<div style="font-size:13px;font-weight:700;color:var(--text-soft);margin-bottom:6px">' + (isAr?'القادم قريباً':'Coming Up') + '</div>' +
    '<div style="font-size:22px">' + nextOcc.em + '</div>' +
    '<div class="countdown-days">' + nextOcc.d + '</div>' +
    '<div style="font-size:12px;color:var(--text-soft);padding:0 8px">' + nextOcc.n + '</div>' +
  '</div>' : '') +

  // QUICK ACTIONS
  '<div style="margin-bottom:20px">' +
    '<div style="font-size:13px;font-weight:800;color:var(--text-soft);text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px">' + (isAr?'وش سنسوي؟ 🤔':'What shall we do? 🤔') + '</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
      '<div class="card tap" onclick="showTab(\'coach\')" style="padding:16px;display:flex;align-items:center;gap:10px"><span style="font-size:24px">💬</span><div><div style="font-weight:700;font-size:13px">' + (isAr?'مدرب AI':'AI Coach') + '</div><div style="font-size:11px;color:var(--text-soft)">' + (isAr?'تحدث معنا':'Talk it out') + '</div></div></div>' +
      '<div class="card tap" onclick="showTab(\'cook\')" style="padding:16px;display:flex;align-items:center;gap:10px"><span style="font-size:24px">👨‍🍳</span><div><div style="font-weight:700;font-size:13px">' + (isAr?'نطبخ':'Cook') + '</div><div style="font-size:11px;color:var(--text-soft)">' + (isAr?'وصفة معاً':'Recipe together') + '</div></div></div>' +
      '<div class="card tap" onclick="showTab(\'dates\')" style="padding:16px;display:flex;align-items:center;gap:10px"><span style="font-size:24px">🌹</span><div><div style="font-weight:700;font-size:13px">' + (isAr?'الخروجات':'Date Ideas') + '</div><div style="font-size:11px;color:var(--text-soft)">' + (isAr?'خططوا معاً':'Plan together') + '</div></div></div>' +
      '<div class="card tap" onclick="openTonight()" style="padding:16px;display:flex;align-items:center;gap:10px"><span style="font-size:24px">🎲</span><div><div style="font-weight:700;font-size:13px">' + (isAr?'وش الليلة؟':'Tonight?') + '</div><div style="font-size:11px;color:var(--text-soft)">' + (isAr?'فاجئونا':'Surprise us') + '</div></div></div>' +
    '</div>' +
  '</div>' +

  // HABITS
  (habits.length > 0 ?
    '<div style="margin-bottom:20px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">' +
        '<div style="font-size:13px;font-weight:800;color:var(--text-soft);text-transform:uppercase;letter-spacing:.08em">' + (isAr?'عاداتنا 🎯':'Our Habits 🎯') + '</div>' +
        '<button onclick="openAddHabit()" style="background:none;border:none;color:var(--rose);font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">+ ' + (isAr?'أضف':'Add') + '</button>' +
      '</div>' +
      habits.slice(0,5).map(function(h){
        var done = h.c && h.c.indexOf(today) !== -1;
        return '<div class="habit-card">' +
          '<button class="habit-check ' + (done?'done':'') + '" onclick="toggleHabit(\'' + h.id + '\')">' + (done?'✓':'') + '</button>' +
          '<div style="flex:1"><div style="font-weight:600;font-size:14px;color:var(--text)">' + (h.e||'🎯') + ' ' + h.n + '</div>' +
          '<div style="font-size:11px;color:var(--text-soft);margin-top:2px">🔥 ' + habitStreak(h) + ' ' + (isAr?'يوم':'days') + '</div></div>' +
          '</div>';
      }).join('') +
    '</div>' :
    '<div style="margin-bottom:20px">' +
      '<div class="card-rose" style="padding:18px;text-align:center">' +
        '<div style="font-size:32px;margin-bottom:8px">🎯</div>' +
        '<div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:4px">' + (isAr?'ابنوا عادات معاً':'Build habits together') + '</div>' +
        '<div style="font-size:12px;color:var(--text-soft);margin-bottom:12px">' + (isAr?'عشاء بدون هواتف، قهوة الصباح...':'Phone-free dinner, morning coffee...') + '</div>' +
        '<button onclick="openAddHabit()" class="btn-rose" style="padding:10px;font-size:13px">+ ' + (isAr?'أضف عادة':'Add Habit') + '</button>' +
      '</div>' +
    '</div>'
  ) +
  '</div>';
}

// ══════════════════════════════════════════════════
//  COACH TAB RENDERER
// ══════════════════════════════════════════════════
function rCoach(el) {
  var msgs = LS.get('aw_chat', []);
  var left = creditsLeft();
  var hasProxy = _proxyActive();
  var rel = (profile && profile.rel) || 'couple';

  // Suggested prompts vary by mode
  var quickChips;
  if(rel === 'parents') {
    quickChips = isAr
      ? ['👨‍👩‍👧 روتين الأسرة','🎮 نشاط للأطفال','💑 وقتنا الخاص','🏠 تنظيم المنزل','😴 نحن متعبون']
      : ['👨‍👩‍👧 Family routine','🎮 Kids activity','💑 Alone time','🏠 Home balance','😴 We\'re exhausted'];
  } else if(rel === 'expat') {
    quickChips = isAr
      ? ['🌍 بُعد عن العائلة','📞 موعد افتراضي','😔 أشتاق للوطن','✈️ زيارة قادمة','💑 كيف نبقى قريبين']
      : ['🌍 Far from home','📞 Virtual date idea','😔 I miss family','✈️ Upcoming visit','💑 Stay connected'];
  } else if(rel === 'solo') {
    quickChips = isAr
      ? ['🌱 نمو شخصي','💭 تأمل اليوم','🎯 هدفي الأسبوعي','😊 أحب نفسي','🔮 مسار حياتي']
      : ['🌱 Personal growth','💭 Today\'s reflection','🎯 Weekly goal','😊 Self-love','🔮 My life path'];
  } else {
    quickChips = isAr
      ? ['كيف نتوقف عن الجدال على التفاصيل الصغيرة؟','اقترح لنا موعداً مميزاً هذا الأسبوع','كيف نعبر عن تقديرنا لبعض أكثر؟','نحتاج مساحة — كيف نتحدث عن ذلك؟','اقترح شيئاً رومانسياً لليلة هذه']
      : ['How do we stop arguing about small things?','Suggest a special date for us this week','How do we show more appreciation?','We need space — how do we talk about it?','Something romantic for tonight?'];
  }

  // Chat messages HTML — dark luxury theme
  var chatHTML = msgs.length === 0
    ? '<div style="padding:40px 20px;text-align:center">' +
        '<div style="font-size:52px;margin-bottom:16px;animation:floatY 3.5s ease-in-out infinite">💬</div>' +
        '<div style="font-family:\'Cormorant Garamond\',serif;font-size:22px;color:#E8849A;margin-bottom:8px;font-weight:600">' + (isAr?'أنا هنا لكما دائماً':'I\'m always here for you') + '</div>' +
        '<div style="font-size:13px;color:rgba(255,255,255,.4);line-height:1.8;max-width:260px;margin:0 auto 24px">' + (isAr?'شاركاني أي شيء — فرح أو حزن، خطط أو مشاكل':'Share anything — joy or worry, plans or problems') + '</div>' +
        '<div style="display:flex;flex-direction:column;gap:10px;max-width:300px;margin:0 auto">' +
          quickChips.slice(0,3).map(function(s){
            return '<button onclick="sendChat(\''+s.replace(/'/g,"\\'")+'\')" style="background:rgba(201,149,74,.12);border:1px solid rgba(201,149,74,.3);color:#F0CC70;border-radius:16px;padding:12px 16px;font-size:13px;cursor:pointer;font-family:inherit;text-align:right;line-height:1.4;transition:all .2s">'+s+'</button>';
          }).join('') +
        '</div>' +
      '</div>'
    : msgs.slice(-30).map(function(m){
        var isUser = m.r === 'user';
        if(isUser) {
          return '<div class="chat-row user">' +
            '<div class="bubble-user">' + esc(m.txt) + '</div>' +
            '<div style="font-size:10px;color:rgba(255,255,255,.25);margin:2px 0 4px;text-align:right">' + (m.t||'') + '</div>' +
          '</div>';
        }
        return '<div class="chat-row ai">' +
          '<div style="display:flex;align-items:flex-start;gap:8px">' +
            '<div style="flex-shrink:0;margin-top:2px">' +
              '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="opacity:.6"><rect width="24" height="24" rx="12" fill="#C9954A"/><path d="M12 6v6l4 2" stroke="#fff" stroke-width="2" stroke-linecap="round"/><path d="M8 8l-2-2M16 8l2-2" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/></svg>' +
            '</div>' +
            '<div class="bubble-ai ' + (m.err?'ai-error':'') + '">' + m.txt.replace(/\n/g,'<br>') + '</div>' +
          '</div>' +
          '<div style="font-size:10px;color:rgba(255,255,255,.25);margin:2px 0 4px;padding-left:22px">' + (m.t||'') + ' 🔒</div>' +
        '</div>';
      }).join('') +
      '<div id="typing" style="display:none;padding:4px 0">' +
        '<div style="display:flex;align-items:center;gap:10px">' +
          '<div style="width:36px;height:36px;border-radius:50%;background:rgba(201,149,74,.15);border:1px solid rgba(201,149,74,.3);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">✦</div>' +
          '<div class="bubble-ai"><div class="typing-dots"><span></span><span></span><span></span></div></div>' +
        '</div>' +
      '</div>';

  el.innerHTML =
    // Dark full-screen coach shell
    '<div style="min-height:100vh;background:linear-gradient(180deg,#150D10 0%,#1E1118 100%);display:flex;flex-direction:column">' +

    // Header bar
    '<div style="padding:16px 20px;border-bottom:1px solid rgba(201,149,74,.15);display:flex;align-items:center;gap:14px;flex-shrink:0">' +
      '<button onclick="showTab(\'home\')" style="background:none;border:none;color:rgba(255,255,255,.5);font-size:22px;cursor:pointer;line-height:1;padding:0">←</button>' +
      '<div style="flex:1">' +
        '<div style="font-family:\'Cormorant Garamond\',serif;font-size:22px;font-weight:600;background:linear-gradient(135deg,#E8849A,#C9954A);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">' + (isAr?'مدربكم الخاص ✦':'Your Private Coach ✦') + '</div>' +
        '<div style="font-size:11px;color:rgba(255,255,255,.35);letter-spacing:.05em">' + (isAr?'🔒 خاص ومشفّر · لأزواج الخليج':'🔒 Private & encrypted · for Gulf couples') + '</div>' +
      '</div>' +
      (msgs.length > 0
        ? '<button onclick="if(confirm(\''+(isAr?'مسح المحادثة؟':'Clear chat?')+'\')){LS.set(\'aw_chat\',[]);rCoach(document.getElementById(\'tab-coach\'))}" style="background:none;border:none;color:rgba(255,255,255,.3);font-size:12px;cursor:pointer;font-family:inherit">🗑</button>'
        : '') +
    '</div>' +

    // Quick chips (horizontal scroll)
    (msgs.length > 0
      ? '<div style="overflow-x:auto;white-space:nowrap;padding:10px 16px;border-bottom:1px solid rgba(201,149,74,.08);-webkit-overflow-scrolling:touch;flex-shrink:0">' +
          quickChips.map(function(s){ return '<span style="display:inline-block;background:rgba(201,149,74,.1);border:1px solid rgba(201,149,74,.25);color:#C9954A;border-radius:20px;padding:6px 14px;font-size:12px;cursor:pointer;margin-right:8px;white-space:nowrap;font-family:inherit" onclick="sendChat(\''+s.replace(/'/g,"\\'")+'\');hap.tap()">'+s+'</span>'; }).join('') +
        '</div>'
      : '') +

    // Chat area
    '<div id="chat-area" style="flex:1;overflow-y:auto;padding:16px 16px 8px;display:flex;flex-direction:column;gap:4px">' +
      chatHTML +
    '</div>' +

    // Credits warning
    (!LS.get('aw_apikey','') && !isAdmin() && left <= 1
      ? '<div style="padding:8px 16px;background:rgba(239,68,68,.08);border-top:1px solid rgba(239,68,68,.15)">' +
          '<div style="font-size:12px;color:#EF4444;text-align:center">⚠️ ' + (isAr?'رسالة واحدة متبقية · تتجدد في منتصف الليل':'1 message left · Resets at midnight') + ' <button onclick="showPaywall()" style="background:var(--gold);color:#150D10;border:none;border-radius:8px;padding:2px 8px;font-size:11px;font-weight:800;cursor:pointer;font-family:inherit;margin-right:4px">Pro ✦</button></div>' +
        '</div>'
      : '') +

    // Input bar — dark themed
    '<div style="padding:12px 16px;padding-bottom:max(12px,env(safe-area-inset-bottom));border-top:1px solid rgba(201,149,74,.15);background:#150D10;flex-shrink:0">' +
      '<div style="display:flex;gap:10px;align-items:flex-end;background:rgba(255,255,255,.06);border:1px solid rgba(201,149,74,.25);border-radius:24px;padding:10px 14px">' +
        '<textarea id="chat-in" rows="1" placeholder="' + (isAr?'شاركونا أي شيء... 💕':'Share anything... 💕') + '" ' +
          'style="flex:1;border:none;background:transparent;resize:none;max-height:120px;font-size:15px;line-height:1.5;overflow-y:auto;padding:0;outline:none;font-family:inherit;color:#FAF7F2" ' +
          'onkeydown="if(event.key===\'Enter\'&&!event.shiftKey){event.preventDefault();sendChat()}" ' +
          'oninput="this.style.height=\'auto\';this.style.height=Math.min(this.scrollHeight,120)+\'px\'"></textarea>' +
        '<button onclick="sendChat()" style="background:linear-gradient(135deg,#C9954A,#F0CC70);color:#150D10;border:none;border-radius:50%;width:40px;height:40px;font-size:18px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .2s;box-shadow:0 4px 16px rgba(201,149,74,.4)">↑</button>' +
      '</div>' +
    '</div>' +

    '</div>';

  setTimeout(function(){ var c=document.getElementById('chat-area'); if(c) c.scrollTop=c.scrollHeight; }, 80);
}

// ══════════════════════════════════════════════════
//  NAVIGATION — showTab (THE MOST CRITICAL FUNCTION)
// ══════════════════════════════════════════════════
var _tabRenderers = {
  home:     rHome,
  coach:    rCoach,
  cook:     rCook,
  dates:    rDates,
  memories: rMemories,
  profile:  rProfile
};
function showTab(id) {
  document.querySelectorAll('.tab-screen').forEach(function(t){ t.classList.remove('active'); });
  document.querySelectorAll('.nav-btn').forEach(function(b){ b.classList.remove('active'); });
  var navBtn = document.getElementById('nav-' + id);
  if(navBtn) navBtn.classList.add('active');
  var el = document.getElementById('tab-' + id);
  if(!el) return;
  el.classList.add('active');
  // Show skeleton while rendering heavy tabs
  if(_tabRenderers[id]) {
    el.innerHTML = '<div class="container" style="padding-top:20px">'+skeletonList(3)+'</div>';
    requestAnimationFrame(function(){ _tabRenderers[id](el); });
  }
  window.scrollTo(0,0);
  hap.tap();
}

// ══════════════════════════════════════════════════
//  THEME & LANGUAGE
// ══════════════════════════════════════════════════
function toggleTheme() {
  var dark = document.body.classList.toggle('dark');
  LS.set('aw_theme', dark ? 'dark' : 'light');
  var icon = dark ? '🌙' : '☀️';
  var b1 = document.getElementById('theme-btn'), b2 = document.getElementById('theme-btn2');
  if(b1) b1.textContent = icon;
  if(b2) b2.textContent = icon;
  hap.tap();
  T(dark ? (isAr?'🌙 الوضع الداكن':'🌙 Dark mode on') : (isAr?'☀️ الوضع الفاتح':'☀️ Light mode on'));
}
async function requestNotifications(){
  if(!('Notification' in window)){ T(isAr?'جهازك لا يدعم الإشعارات':'Your device does not support notifications'); return; }
  if(Notification.permission === 'denied'){
    T(isAr?'الإشعارات محظورة — فعّلها من إعدادات المتصفح':'Notifications blocked — enable in browser Settings'); return;
  }
  if(Notification.permission === 'granted'){
    scheduleRitualPush();
    T(isAr?'التذكيرات مفعّلة بالفعل ✓':'Reminders already enabled ✓'); return;
  }
  const permission = await Notification.requestPermission();
  if(permission === 'granted'){
    scheduleRitualPush();
    LS.set('aw_notif_asked', true);
    T(isAr?'تم تفعيل التذكيرات 💌':'Evening reminders enabled 💌');
  } else if(permission === 'denied'){
    T(isAr?'تم حظر الإشعارات. غيّر إعدادات المتصفح':'Notifications blocked. Change browser settings');
  }
}
function toggleLang() {
  isAr = !isAr;
  LS.set('aw_lang', isAr);
  document.documentElement.lang = isAr ? 'ar' : 'en';
  document.documentElement.dir = isAr ? 'rtl' : 'ltr';
  document.body.classList.toggle('rtl', isAr);
  var lBtn = document.getElementById('lang-btn');
  if(lBtn) lBtn.textContent = isAr ? 'EN' : 'عربي';
  // Re-render active tab
  var active = document.querySelector('.tab-screen.active');
  if(active) {
    var tabId = active.id.replace('tab-','');
    if(_tabRenderers[tabId]) _tabRenderers[tabId](active);
  }
  hap.tap();
}

// ══════════════════════════════════════════════════
//  AUTH FUNCTIONS
// ══════════════════════════════════════════════════
function switchAuth(mode) {
  var si = document.getElementById('si-form'), su = document.getElementById('su-form');
  var tabSi = document.getElementById('at-si'), tabSu = document.getElementById('at-su');
  if(!si || !su) return;
  if(mode === 'si') {
    si.style.display = 'block'; su.style.display = 'none';
    tabSi.style.cssText += ';background:var(--rose);color:#fff';
    tabSu.style.cssText += ';background:transparent;color:var(--text-soft)';
  } else {
    si.style.display = 'none'; su.style.display = 'block';
    tabSu.style.cssText += ';background:var(--rose);color:#fff';
    tabSi.style.cssText += ';background:transparent;color:var(--text-soft)';
  }
  hap.tap();
}
async function doSignIn() {
  var email = (document.getElementById('si-email')||{}).value || '';
  var pass  = (document.getElementById('si-pass')||{}).value  || '';
  var btn   = document.getElementById('si-btn');
  email = email.trim();
  if(!email || !pass) { T(isAr?'أكمل جميع الحقول':'Fill all fields'); hap.error(); return; }
  if(btn) btn.innerHTML = '<span class="spinner"></span>';
  var accounts = LS.get('aw_accounts', []);
  var hash = await hashPw(pass);
  var found = accounts.find(function(a){ return a.email === email && a.hash === hash; });
  var btnLabel = '<span class="en">Sign In 💕</span><span class="ar">دخول 💕</span>';
  if(found) {
    if(found.verified === false) {
      if(btn) btn.innerHTML = btnLabel;
      openVerifySheet(email, found.verifyCode);
      T(isAr?'الرجاء تأكيد بريدك الإلكتروني أولاً':'Please verify your email first');
      hap.tap();
      return;
    }
    profile = found.profile;
    LS.set('aw_profile', profile);
    if(btn) btn.innerHTML = btnLabel;
    launchApp();
  } else {
    if(btn) btn.innerHTML = btnLabel;
    T(isAr?'البريد أو كلمة المرور غير صحيحة':'Wrong email or password'); hap.error();
  }
}
function openVerifySheet(email, code) {
  // code = null → email was sent (show "check inbox")
  // code = string → email failed or resend not configured (show code prominently on screen)
  var codeBlock = code
    ? '<div onclick="autoFillCode(\'' + code + '\')" style="cursor:pointer;user-select:none;background:rgba(240,204,112,.14);border:2px solid var(--gold);border-radius:14px;padding:20px;text-align:center;margin-bottom:16px">' +
        '<div style="font-size:11px;color:var(--text-soft);margin-bottom:8px;text-transform:uppercase;letter-spacing:1px">' + (isAr?'رمز التحقق — اضغط للنسخ':'Verification code — tap to fill') + '</div>' +
        '<div style="font-family:monospace;font-size:36px;font-weight:700;color:var(--gold);letter-spacing:10px">' + code + '</div>' +
        '<div style="font-size:12px;color:var(--text-soft);margin-top:8px">' + (isAr?'سيتم النسخ تلقائياً عند الضغط':'Auto-fills the input when tapped') + '</div>' +
      '</div>'
    : '<div style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:14px;text-align:center;margin-bottom:16px">' +
        '<div style="font-size:22px;margin-bottom:6px">📧</div>' +
        '<div style="font-size:14px;color:var(--text-mid);font-weight:600">' + (isAr?'تحقق من صندوق الوارد':'Check your email inbox') + '</div>' +
        '<div style="font-size:12px;color:var(--text-soft);margin-top:4px">' + email + '</div>' +
      '</div>';
  var sh = getSheet('verify-sh');
  sh.querySelector('.sheet').innerHTML =
    '<div class="sheet-handle"></div>' +
    '<h3 style="font-family:\'Cormorant Garamond\',serif;color:var(--rose);margin-bottom:10px;font-size:22px">' + (isAr?'تفعيل الحساب 💕':'Activate Account 💕') + '</h3>' +
    '<div style="font-size:14px;color:var(--text-mid);line-height:1.7;margin-bottom:14px">' +
      (isAr ? 'أدخل رمز التحقق لتفعيل حسابك' : 'Enter the verification code to activate your account') +
    '</div>' +
    codeBlock +
    '<div style="margin-bottom:16px">' +
      '<label class="label">' + (isAr?'رمز التحقق (6 أحرف)':'6-character code') + '</label>' +
      '<input id="verify-code" placeholder="ABC123" autocomplete="one-time-code" style="text-transform:uppercase;letter-spacing:6px;font-size:22px;text-align:center;font-weight:700;font-family:monospace">' +
    '</div>' +
    '<button class="btn-rose" style="margin-bottom:10px" onclick="verifySignupCode(\'' + email + '\')">' + (isAr?'تفعيل الحساب 💕':'Activate Account 💕') + '</button>' +
    '<button class="btn-ghost" style="padding:14px;font-size:14px" onclick="resendVerificationCode(\'' + email + '\')">' + (isAr?'إعادة إرسال الرمز':'Resend code') + '</button>';
  sh.classList.add('open');
}
async function verifySignupCode(email) {
  var input = ((document.getElementById('verify-code')||{}).value||'').trim().toUpperCase();
  if(!input){ T(isAr?'أدخل رمز التحقق':'Enter the verification code'); hap.error(); return; }
  var accounts = LS.get('aw_accounts', []);
  var account = accounts.find(function(a){ return a.email === email; });
  if(!account){ T(isAr?'حساب غير موجود':'Account not found'); hap.error(); return; }
  var btn = document.getElementById('verify-btn');
  if(btn){ btn.disabled = true; btn.textContent = isAr?'جاري التحقق...':'Verifying...'; }
  var res = await verifyCodeOnServer(email, input);
  if(btn){ btn.disabled = false; btn.textContent = isAr?'تأكيد':'Confirm'; }
  if(res.error === 'expired'){
    T(isAr?'انتهت صلاحية الرمز، اطلب رمزاً جديداً':'Code expired — request a new one'); hap.error(); return;
  }
  if(res.error === 'too_many_attempts'){
    T(isAr?'تجاوزت عدد المحاولات المسموحة':'Too many attempts — request a new code'); hap.error(); return;
  }
  if(res.error === 'wrong_code'){
    var left = res.attemptsLeft != null ? ' ('+res.attemptsLeft+' '+(isAr?'محاولات متبقية':'left')+')' : '';
    T((isAr?'رمز غير صحيح':'Wrong code')+left); hap.error(); return;
  }
  if(!res.verified){ T(isAr?'فشل التحقق، حاول مجدداً':'Verification failed, try again'); hap.error(); return; }
  account.verified = true;
  LS.set('aw_accounts', accounts);
  profile = account.profile;
  if(obVibe) { profile.vibe = obVibe; }
  if(obWish) { profile.firstWish = obWish; }
  LS.set('aw_profile', profile);
  closeSheet('verify-sh');
  T(isAr?'تم التحقق بنجاح 💕':'Verified successfully 💕');
  hap.celebrate();
  document.getElementById('auth-screen').style.display = 'none';
  // Names already collected pre-auth — go straight to anniversary step
  obMode = 'post';
  obStep = 1; // skip names (already saved)
  document.getElementById('onboarding').style.display = 'block';
  ['ob-0','ob-1','ob-2','ob-3'].forEach(function(id){
    var el = document.getElementById(id); if(el) el.style.display = 'none';
  });
  var ob3 = document.getElementById('ob-3');
  if(ob3) ob3.style.display = 'flex';
  var fill = document.getElementById('ob-fill'); if(fill) fill.style.width = '90%';
}
async function resendVerificationCode(email) {
  var accounts = LS.get('aw_accounts', []);
  var account = accounts.find(function(a){ return a.email === email; });
  if(!account){ T(isAr?'حساب غير موجود':'Account not found'); hap.error(); return; }
  var name = (account.profile && account.profile.n1) || '';
  T(isAr?'جاري الإرسال...':'Sending...'); hap.tap();
  var result = await requestVerificationCode(email, name, 'resend');
  if(result.error === 'rate_limited'){
    var mins = result.retryAfterMs ? Math.ceil(result.retryAfterMs/60000) : 60;
    T(isAr?('تجاوزت الحد. انتظر '+mins+' دقيقة'):('Limit reached. Try again in '+mins+' min')); hap.error(); return;
  }
  if(!result.ok){ T(isAr?'فشل الإرسال، حاول لاحقاً':'Failed to send, try later'); hap.error(); return; }
  closeSheet('verify-sh');
  openVerifySheet(email, (result.fallback && result.code) ? result.code : null);
  if(!result.fallback){
    T(isAr?'تم الإرسال! تحقق من بريدك 📧':'Sent! Check your email 📧'); hap.success();
  } else {
    T(isAr?'انسخ الرمز الجديد أدناه':'Copy the new code below'); hap.tap();
  }
}
async function doSignUp() {
  var n1    = ((document.getElementById('su-n1')||{}).value||'').trim();
  var n2    = ((document.getElementById('su-n2')||{}).value||'').trim();
  var email = ((document.getElementById('su-email')||{}).value||'').trim().toLowerCase();
  var pass  = (document.getElementById('su-pass')||{}).value || '';
  var fam   = (document.getElementById('su-fam')||{}).value || 'couple';
  var btn   = document.getElementById('su-btn');
  var btnLabel = '<span class="en">Create Your Private World 💕</span><span class="ar">افتح عالمكما الخاص 💕</span>';
  if(!n1){ T(isAr?'أدخل اسمك':'Enter your name'); hap.error(); return; }
  if(!email||!pass){ T(isAr?'البريد الإلكتروني وكلمة المرور مطلوبان':'Email and password required'); hap.error(); return; }
  if(pass.length < 6){ T(isAr?'كلمة المرور قصيرة (6+ أحرف)':'Password too short (6+ chars)'); hap.error(); return; }
  if(!email.includes('@')){ T(isAr?'بريد إلكتروني غير صحيح':'Invalid email'); hap.error(); return; }
  if(btn) btn.innerHTML = '<span class="spinner"></span>';

  var accounts = LS.get('aw_accounts', []);
  var existing = accounts.find(function(a){ return a.email === email; });
  if(existing) {
    if(btn) btn.innerHTML = btnLabel;
    if(!existing.verified) {
      // Unverified — request fresh server-side code
      var resend = await requestVerificationCode(email, existing.profile.n1 || n1, 'signup');
      if(resend.error === 'rate_limited') {
        var mins = Math.ceil((resend.retryAfterMs || 86400000) / 60000);
        T(isAr?'تم الوصول للحد — انتظر '+mins+' دقيقة':'Rate limited — try again in '+mins+' min'); hap.error(); return;
      }
      openVerifySheet(email, (resend.fallback && resend.code) ? resend.code : null);
      T(isAr?'الحساب موجود — تم إرسال رمز جديد 📧':'Account exists — new code sent 📧');
    } else {
      T(isAr?'البريد مستخدم — سجّل دخولك':'Email registered — sign in instead'); hap.error();
    }
    return;
  }

  // New account — request server-side code BEFORE saving locally
  var result = await requestVerificationCode(email, n1, 'signup');
  if(btn) btn.innerHTML = btnLabel;

  if(result.error === 'rate_limited') {
    var mins2 = Math.ceil((result.retryAfterMs || 86400000) / 60000);
    T(isAr?'محاولات كثيرة — انتظر '+mins2+' دقيقة':'Too many attempts — try again in '+mins2+' min'); hap.error(); return;
  }
  if(!result.ok) {
    T(isAr?'خطأ في الشبكة — حاول مجدداً':'Network error — please try again'); hap.error(); return;
  }

  var hash = await hashPw(pass);
  var newProfile = { n1:n1, n2:n2, fam:fam, code:genCode(), firstWish:obWish||'', ann:'', vibe:obVibe||'' };
  // Store account WITHOUT the code (code lives on server only)
  accounts.push({ email:email, hash:hash, profile:newProfile, verified:false });
  LS.set('aw_accounts', accounts);
  profile = newProfile;
  LS.set('aw_profile', profile);
  hap.celebrate();

  // Show verify sheet: null = email sent to inbox; code string = fallback on-screen
  openVerifySheet(email, (result.fallback && result.code) ? result.code : null);
  T(result.fallback
    ? (isAr?'تم الإنشاء! انسخ الرمز أدناه':'Created! Copy the code below')
    : (isAr?'تم الإنشاء! تحقق من بريدك 📧':'Created! Check your email inbox 📧'));

  storeLead({email:email, name:n1, partner:n2, vibe:obVibe||'', wish:obWish||'', fam:fam, lang:isAr?'ar':'en', source:'signup'});
  obWish = '';
}
// ── ONBOARDING DEMO PREVIEW ──────────────────────────
var _demoSlide = 1;
var _demoTimer = null;
function startDemoPreview() {
  var prev = document.getElementById('ob-preview');
  if(prev) prev.style.display = 'flex';
  var fill = document.getElementById('ob-fill'); if(fill) fill.style.width = '0%';
  _demoSlide = 1;
  _demoTimer = setInterval(advanceDemoSlide, 3200);
}
function advanceDemoSlide() {
  if(_demoSlide >= 3) { clearInterval(_demoTimer); _demoTimer = null; return; }
  _demoSlide++;
  [1,2,3].forEach(function(i){
    var s = document.getElementById('demo-s'+i);
    var d = document.getElementById('dd'+i);
    if(s) s.classList.toggle('active', i === _demoSlide);
    if(d) d.classList.toggle('active', i === _demoSlide);
  });
}
function skipToLang() {
  if(_demoTimer) { clearInterval(_demoTimer); _demoTimer = null; }
  var prev = document.getElementById('ob-preview');
  if(prev) { prev.style.opacity='0'; prev.style.transition='opacity .3s'; setTimeout(function(){prev.style.display='none';},300); }
  setTimeout(function(){
    var fill = document.getElementById('ob-fill'); if(fill) fill.style.width = '0%';
    var obL = document.getElementById('ob-lang');
    if(obL) obL.style.display = 'flex';
  }, 320);
}

function setObLang(lang) {
  LS.set('aw_lang_chosen', true);
  if(lang === 'ar') {
    isAr = true;
    LS.set('aw_lang', true);
    document.body.classList.add('rtl');
    document.documentElement.dir = 'rtl';
  } else {
    isAr = false;
    LS.set('aw_lang', false);
    document.body.classList.remove('rtl');
    document.documentElement.dir = 'ltr';
  }
  hap.tap();
  var obL = document.getElementById('ob-lang');
  if(obL) { obL.style.opacity='0'; obL.style.transition='opacity .3s'; setTimeout(function(){ obL.style.display='none'; },300); }
  setTimeout(function(){
    var ob0 = document.getElementById('ob-0');
    if(ob0) ob0.style.display = 'flex';
    var fill = document.getElementById('ob-fill'); if(fill) fill.style.width = '33%';
  }, 320);
}
function selectObVibe(v,el){
  obVibe = v;
  document.querySelectorAll('.ob-vibe-card').forEach(function(card){
    card.style.borderColor = 'var(--border)';
    card.style.background = 'rgba(255,255,255,.04)';
  });
  if(el){
    el.style.borderColor = 'var(--rose)';
    el.style.background = 'rgba(232,132,154,.12)';
  }
  hap.tap();
}
function selectObWish(w,el){
  obWish = w;
  document.querySelectorAll('.ob-vibe-card').forEach(function(card){
    card.style.borderColor = 'var(--border)';
    card.style.background = 'rgba(255,255,255,.04)';
  });
  if(el){
    el.style.borderColor = 'var(--gold)';
    el.style.background = 'rgba(240,204,112,.16)';
  }
  hap.tap();
}
function nextObStep(){
  // ── PRE-AUTH PHASE: vibe → names → wish → signup (2 fields only) ──
  if(obMode === 'pre'){

    if(obStep === 0){
      // Vibe done → show names (ob-1)
      if(!obVibe){ T(isAr?'اختر مزاج علاقتكما أولاً':'Choose your relationship vibe first'); hap.error(); return; }
      obStep = 1;
      var ob0 = document.getElementById('ob-0');
      var ob1 = document.getElementById('ob-1');
      if(ob0) ob0.style.display = 'none';
      if(ob1) ob1.style.display = 'flex';
      var fill = document.getElementById('ob-fill'); if(fill) fill.style.width = '33%';
      setTimeout(function(){ var f = document.getElementById('ob-n1'); if(f) f.focus(); }, 300);
      return;
    }

    if(obStep === 1){
      // Names done → show wish (ob-2)
      var n1pre = ((document.getElementById('ob-n1')||{}).value||'').trim();
      if(!n1pre){ T(isAr?'أدخل اسمك أولاً':'Enter your name first'); hap.error(); return; }
      obStep = 2;
      var ob1b = document.getElementById('ob-1');
      var ob2 = document.getElementById('ob-2');
      if(ob1b) ob1b.style.display = 'none';
      if(ob2) ob2.style.display = 'flex';
      var fill = document.getElementById('ob-fill'); if(fill) fill.style.width = '66%';
      return;
    }

    if(obStep === 2){
      // Wish done → show simplified auth (names hidden, pre-filled)
      if(!obWish){ T(isAr?'اختر طقسكما الأول':'Choose your first ritual'); hap.error(); return; }
      // Pre-fill name fields and hide them so signup only needs email + password
      var n1v = ((document.getElementById('ob-n1')||{}).value||'').trim();
      var n2v = ((document.getElementById('ob-n2')||{}).value||'').trim();
      var suN1 = document.getElementById('su-n1'); if(suN1) suN1.value = n1v || 'You';
      var suN2 = document.getElementById('su-n2'); if(suN2) suN2.value = n2v || 'Partner';
      var namesRow = document.getElementById('su-names-row'); if(namesRow) namesRow.style.display = 'none';
      var famRow = document.getElementById('su-fam-row'); if(famRow) famRow.style.display = 'none';
      var ob = document.getElementById('onboarding'); if(ob) ob.style.display = 'none';
      var auth = document.getElementById('auth-screen'); if(auth) auth.style.display = 'block';
      switchAuth('su');
      hap.celebrate();
      T(isAr?'مرحباً '+n1v+'! خطوتان فقط: بريدك وكلمة المرور 💕':'Hi '+n1v+'! Two steps: email + password 💕');
      return;
    }
  }

  // ── POST-AUTH PHASE: names already saved → go straight to anniversary ──
  if(obMode === 'post'){
    if(obStep === 0){
      // Names came from pre-auth — just validate they're present
      var n1 = ((document.getElementById('ob-n1')||{}).value||profile.n1||'').trim();
      var n2 = ((document.getElementById('ob-n2')||{}).value||profile.n2||'').trim();
      if(n1) { profile.n1 = n1; }
      if(n2) { profile.n2 = n2; }
      if(!profile.n1){ T(isAr?'أدخل اسمك':'Enter your name'); hap.error(); return; }
      LS.set('aw_profile', profile);
      obStep = 1;
      var ob1c = document.getElementById('ob-1');
      var ob3 = document.getElementById('ob-3');
      if(ob1c) ob1c.style.display = 'none';
      if(ob3) ob3.style.display = 'flex';
      var fill = document.getElementById('ob-fill'); if(fill) fill.style.width = '100%';
      return;
    }
  }
}
function doGuest() {
  profile = { n1: isAr?'أنتم':'You', n2: isAr?'شريككم':'Partner', fam:'couple', guest:true, code:genCode(),
    firstWish: obWish||'Date', vibe: obVibe||'Romantic' };
  LS.set('aw_profile', profile);
  document.getElementById('auth-screen').style.display = 'none';
  launchApp();
}
function finishOb() {
  if(obMode === 'pre'){ nextObStep(); return; }
  // post-auth step 0: collect names (fallback for direct-signup path)
  if(obMode === 'post' && obStep === 0){ nextObStep(); return; }
  // post-auth step 1 (or final): save anniversary → launch
  var ann = (document.getElementById('ob-ann')||{}).value;
  if(ann && profile){ profile.ann = ann; LS.set('aw_profile', profile); }
  launchApp();
}
function doSignOut() {
  var sh = getSheet('farewell-sh');
  sh.querySelector('.sheet').innerHTML =
    '<div class="sheet-handle"></div>' +
    '<div style="text-align:center;padding:8px 0">' +
      '<div style="font-size:52px;margin-bottom:10px;animation:bounceIn .4s ease">✨</div>' +
      '<div style="font-family:\'Cormorant Garamond\',serif;color:var(--rose);font-size:20px;font-weight:700;margin-bottom:10px">' + (isAr?'إلى اللقاء يا قلبي':'See you soon, love') + '</div>' +
      '<div style="font-size:14px;color:var(--text-mid);line-height:1.7;margin-bottom:20px">' + (isAr?'رحلتك محفوظة، وطقوسك الخاصة بانتظارك عند العودة':'Your journey is saved, and your private rituals await when you return') + '</div>' +
      '<button class="btn-rose" style="padding:14px;font-size:14px;width:100%;margin-bottom:10px" onclick="confirmSignOut()">' + (isAr?'تسجيل الخروج':'Sign Out') + '</button>' +
      '<button class="btn-ghost" style="padding:14px;font-size:14px;width:100%;" onclick="closeSheet(\'farewell-sh\')">' + (isAr?'ابقَ هنا':'Stay here') + '</button>' +
    '</div>';
  sh.classList.add('open');
  hap.tap();
}
function confirmSignOut() {
  closeSheet('farewell-sh');
  profile = null;
  LS.set('aw_profile', null);
  document.getElementById('app').style.display = 'none';
  document.getElementById('auth-screen').style.display = 'block';
  switchAuth('si');
  T(isAr?'إلى اللقاء قريباً 💕':'See you soon 💕');
  hap.tap();
}
function showRitualReveal() {
  var p = profile || {};
  if(!p.firstWish || LS.get('aw_ritual_reveal_shown', false)) return;
  LS.set('aw_ritual_reveal_shown', true);

  var title = isAr ? 'طقسك الأول جاهز' : 'Your first ritual is ready';
  var description = isAr ? 'هذا اختيارك الأول لبداية ليلتكما الخاصة.' : 'This is your first choice to begin your special evening.';
  var action = isAr ? 'ابدأ الآن' : 'Start now';
  var detail = isAr ? 'واحد من أفضل الطرق لبدء رحلتكما معاً.' : 'One of the best ways to start your journey together.';
  var icon = '✨';
  var target = 'dates';
  if(p.firstWish === 'Date') { icon = '🌹'; action = isAr ? 'عرض خطتنا' : 'Open Date Plan'; target = 'dates'; }
  if(p.firstWish === 'Cook') { icon = '👩‍🍳'; action = isAr ? 'لنطبخ' : "Let's Cook"; target = 'cook'; }
  if(p.firstWish === 'Memories') { icon = '📖'; action = isAr ? 'سجل ذكرى' : 'Save a Memory'; target = 'memories'; }

  var sh = getSheet('launch-sh');
  sh.querySelector('.sheet').innerHTML =
    '<div class="sheet-handle"></div>' +
    '<div style="text-align:center;padding:8px 0">' +
      '<div style="font-size:52px;margin-bottom:10px;animation:bounceIn .4s ease">' + icon + '</div>' +
      '<div style="font-family:\'Cormorant Garamond\',serif;color:var(--rose);font-size:20px;font-weight:700;margin-bottom:10px">' + title + '</div>' +
      '<div style="font-size:14px;color:var(--text-mid);line-height:1.7;margin-bottom:16px">' + description + '</div>' +
      '<div style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:20px">' + detail + '</div>' +
      '<button class="btn-gold" style="width:100%;padding:14px;font-size:14px;font-weight:800" onclick="closeSheet(\'launch-sh\');showTab(\'' + target + '\')">' + action + '</button>' +
    '</div>';
  sh.classList.add('open');
  hap.celebrate();
}
function launchApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('onboarding').style.display = 'none';
  var app = document.getElementById('app');
  app.style.display = 'block';
  // Apply saved theme
  if(LS.get('aw_theme','light') === 'dark'){
    document.body.classList.add('dark');
    var btn = document.getElementById('theme-btn'); if(btn) btn.textContent = '🌙';
  }
  // Apply saved language
  if(LS.get('aw_lang',false)){
    document.body.classList.add('rtl');
    document.documentElement.dir = 'rtl';
    var lBtn = document.getElementById('lang-btn'); if(lBtn) lBtn.textContent = 'EN';
  }
  // Update header names
  var hdrNames = document.getElementById('hdr-names');
  if(hdrNames && profile) hdrNames.textContent = (profile.n1||'') + (profile.n2?' & '+profile.n2:'') + ' 💕';
  updateCredits();
  purgeChatCache();
  showTab('home');
  checkPairURL();
  if(profile && profile.firstWish && !LS.get('aw_ritual_reveal_shown', false)) {
    setTimeout(showRitualReveal, 700);
  }
  setTimeout(showInstallBanner, 5000);
  // Show chat FAB if partner is linked
  var _pc2 = LS.get('aw_partner_code','');
  var chatFab = document.getElementById('chat-fab');
  if(chatFab) chatFab.classList.toggle('show', !!_pc2);
  // Ask for notification permission after 90 seconds (warm first-session moment)
  if(!LS.get('aw_notif_asked', false)) {
    setTimeout(showNotifPermissionCard, 90000);
  }
}

function showNotifPermissionCard(){
  if(LS.get('aw_notif_asked', false)) return;
  LS.set('aw_notif_asked', true);
  if(!('Notification' in window)) return;
  if(Notification.permission === 'granted') { scheduleRitualPush(); return; }
  if(Notification.permission === 'denied') return;
  // Show friendly permission card before triggering browser dialog
  var div = document.createElement('div');
  div.id = 'notif-card';
  div.style.cssText = 'position:fixed;bottom:90px;left:16px;right:16px;max-width:440px;margin:0 auto;background:linear-gradient(135deg,rgba(232,132,154,.15),rgba(201,149,74,.1));border:1px solid rgba(232,132,154,.3);border-radius:20px;padding:18px 20px;z-index:990;box-shadow:0 8px 32px rgba(0,0,0,.15);animation:fadeUp .4s ease;backdrop-filter:blur(8px)';
  div.innerHTML =
    '<div style="display:flex;align-items:flex-start;gap:14px">' +
      '<div style="font-size:32px;line-height:1">🌙</div>' +
      '<div style="flex:1">' +
        '<div style="font-size:14px;font-weight:800;color:var(--rose);margin-bottom:4px">' + (isAr?'تذكير الليلة 💕':'Evening reminder 💕') + '</div>' +
        '<div style="font-size:12px;color:var(--text-soft);line-height:1.6;margin-bottom:12px">' + (isAr?'نُرسل لكما تذكيراً كل مساء في الساعة 8:30 — لتقضيا وقتاً إضافياً معاً.':'We\'ll remind you every evening at 8:30 PM to spend extra time together.') + '</div>' +
        '<div style="display:flex;gap:8px">' +
          '<button onclick="document.getElementById(\'notif-card\').remove();Notification.requestPermission().then(function(p){if(p===\'granted\'){scheduleRitualPush();T(isAr?\'تم تفعيل التذكيرات ✓\':\'Reminders enabled ✓\');}});hap.success()" style="flex:1;background:linear-gradient(135deg,var(--rose),var(--rose-deep));color:#fff;border:none;border-radius:12px;padding:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">' + (isAr?'فعّل التذكيرات':'Enable') + '</button>' +
          '<button onclick="document.getElementById(\'notif-card\').remove();hap.tap()" style="background:none;border:1px solid var(--border);color:var(--text-soft);border-radius:12px;padding:10px 14px;font-size:12px;cursor:pointer;font-family:inherit">' + (isAr?'لاحقاً':'Later') + '</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(div);
  setTimeout(function(){ if(div.parentNode) div.remove(); }, 20000);
}

// ══════════════════════════════════════════════════
//  MISC HELPERS
// ══════════════════════════════════════════════════
function togglePw(fieldId) {
  var inp = document.getElementById(fieldId);
  if(!inp) return;
  inp.type = inp.type === 'password' ? 'text' : 'password';
  hap.tap();
}
function saveSecretLang() { LS.set('aw_secretlang', secretLang); }
function getSecretLabel(emoji) {
  var found = secretLang.find(function(s){ return s.emoji === emoji; });
  return found ? found.meaning : '';
}
function exportData() {
  var data = {
    profile: profile,
    habits: habits,
    memories: memories,
    occasions: occasions,
    dateHist: dateHist,
    gratState: gratState,
    secretLang: secretLang,
    grocery: grocery,
    chat: LS.get('aw_chat',[]),
    exported: new Date().toISOString(),
    app: 'Ana Wyak'
  };
  var blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'anawyak-backup-' + new Date().toISOString().split('T')[0] + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  hap.success();
  T(isAr?'تم التصدير! 📥':'Exported! 📥');
}

// ══════════════════════════════════════════════════
//  TONIGHT DECIDER 🎲
// ══════════════════════════════════════════════════
var TONIGHT_REGIONS = [
  {id:'UAE', en:'UAE', ar:'الإمارات'},
  {id:'KSA', en:'Saudi Arabia', ar:'السعودية'},
  {id:'QTR', en:'Qatar', ar:'قطر'}
];
var TONIGHT_BUDGETS = [
  {id:'Low', en:'Easy Budget', ar:'اقتصادي'},
  {id:'Medium', en:'Balanced', ar:'متوسط'},
  {id:'High', en:'Luxury', ar:'فاخر'}
];
var TONIGHT_MOODS = [
  {id:'Romantic', en:'Romantic', ar:'رومانسي'},
  {id:'Cozy', en:'Cozy', ar:'دافئ'},
  {id:'Adventurous', en:'Adventurous', ar:'مغامر'}
];
var tonightRegion = 'UAE';
var tonightBudget = 'Medium';
var tonightMood = 'Romantic';
var DATE_VENUES = [
  {region:'UAE',budget:'High',moods:['Romantic','Luxury'],place:'The Farm at Al Barari',city:'Dubai',rating:'4.7','source':'Instagram gem',en:'A private dinner in a green oasis with candlelit paths, rosewater desserts and luxury service.',ar:'عشاء خاص في واحة خضراء مع دروب من الشموع، حلويات بالماء الورد، وخدمة فاخرة.'},
  {region:'UAE',budget:'Medium',moods:['Cozy','Romantic'],place:'Horse & Flower Café',city:'Dubai',rating:'4.6','source':'Google review',en:'A farm-style café between horses and flower gardens, perfect for coffee and sunset stories.',ar:'مقهى ريفي بين الخيول وحدائق الأزهار، مثالي للقهوة وقصص الغروب.'},
  {region:'UAE',budget:'Medium',moods:['Adventurous','Cozy'],place:'Alserkal Avenue Art Walk',city:'Dubai',rating:'4.5','source':'TikTok favorite',en:'Art galleries, outdoor coffee and a creative date in Dubai cultural district.',ar:'سير في المعارض وفنجان قهوة في قلب الحي الثقافي بدبي.'},
  {region:'UAE',budget:'High',moods:['Luxury','Romantic'],place:'Iris Dubai',city:'Dubai',rating:'4.7','source':'Google review',en:'Rooftop sunset dining with skyline views, perfect for a landmark romantic night.',ar:'عشاء سقفي عند الغروب مع إطلالة على أفق دبي، مناسب لليلة رومانسية راقية.'},
  {region:'UAE',budget:'Medium',moods:['Adventurous','Romantic'],place:'Qasr Al Sarab Desert Dinner',city:'Abu Dhabi',rating:'4.8','source':'Travel review',en:'A desert resort dinner in royal tents, luxury tea and private dune walk.',ar:'عشاء في صحراء أبوظبي داخل خيام ملكية مع شاي فاخر ومشي عبر الكثبان.'},
  {region:'KSA',budget:'Low',moods:['Cozy','Romantic'],place:'The Beach Road Walk',city:'Jeddah',rating:'4.6','source':'Google review',en:'A sunset corniche walk with dessert by the sea and soft lights.',ar:'تمشية على الكورنيش عند الغروب مع حلوى بجانب البحر.'},
  {region:'KSA',budget:'Medium',moods:['Romantic','Cozy'],place:'Najd Village Dining',city:'Riyadh',rating:'4.7','source':'Local favorite',en:'Traditional Najdi dining in a heritage tent, with lanterns, music and Saudi sweets.',ar:'عشاء نجدي تقليدي في خيمة تراثية، مع فوانيس وموسيقى وحلويات سعودية.'},
  {region:'KSA',budget:'High',moods:['Luxury','Romantic'],place:'Layali Al Khobar Terrace',city:'Khobar',rating:'4.8','source':'Instagram gem',en:'A private sea-view terrace dinner with seafood and elegant Saudi hospitality.',ar:'عشاء على تراس خاص بإطلالة بحرية، مأكولات بحرية وضيافة سعودية أنيقة.'},
  {region:'QTR',budget:'High',moods:['Luxury','Romantic'],place:'Iris Doha Rooftop',city:'Doha',rating:'4.7','source':'Google review',en:'Skyline views and modern Gulf cuisine in a romantic rooftop setting.',ar:'إطلالة على أفق الدوحة مع مطبخ خليجي عصري وأجواء رومانسية.'},
  {region:'QTR',budget:'Medium',moods:['Cozy','Romantic'],place:'Souq Waqif Lantern Dinner',city:'Doha',rating:'4.6','source':'Travel review',en:'A private lantern-lit dinner in Souq Waqif with local flavors and perfumed coffee.',ar:'عشاء خاص بضوء الفوانيس في سوق واقف مع نكهات محلية وقهوة معطرة.'},
  {region:'QTR',budget:'High',moods:['Cozy','Adventurous'],place:'Al Shaqab Horse Ranch Café',city:'Doha',rating:'4.7','source':'Instagram favorite',en:'A luxury equestrian ranch café date surrounded by horses, calm gardens and coffee.',ar:'تجربة مقهى فخم في مزرعة خيل، تحيط بها الحدائق الهادئة والقهوة.'}
];
function selectTonightRegion(id,el){
  tonightRegion = id;
  document.querySelectorAll('.tn-region').forEach(function(btn){ btn.style.borderColor = 'rgba(255,255,255,.12)'; btn.style.color = 'var(--text-soft)'; btn.style.background='var(--card2)'; });
  if(el){ el.style.borderColor='var(--gold)'; el.style.color='var(--rose)'; el.style.background='rgba(240,204,112,.15)'; }
  hap.tap();
}
function selectTonightBudget(id,el){
  tonightBudget = id;
  document.querySelectorAll('.tn-budget').forEach(function(btn){ btn.style.borderColor = 'rgba(255,255,255,.12)'; btn.style.color = 'var(--text-soft)'; btn.style.background='var(--card2)'; });
  if(el){ el.style.borderColor='var(--rose)'; el.style.color='var(--rose)'; el.style.background='rgba(232,132,154,.14)'; }
  hap.tap();
}
function selectTonightMood(id,el){
  tonightMood = id;
  document.querySelectorAll('.tn-mood').forEach(function(btn){ btn.style.borderColor = 'rgba(255,255,255,.12)'; btn.style.color = 'var(--text-soft)'; btn.style.background='var(--card2)'; });
  if(el){ el.style.borderColor='var(--gold)'; el.style.color='var(--rose)'; el.style.background='rgba(240,204,112,.15)'; }
  hap.tap();
}
// Tonight — psychological 2-question wizard + AI-powered personalised suggestion
var _tnEnergy = '', _tnNeed = '';
var _tnEnergyOptions = [
  {id:'high', en:'⚡ Full of energy', ar:'⚡ مليء بالطاقة'},
  {id:'medium', en:'😊 Balanced & ready', ar:'😊 متوازن ومستعد'},
  {id:'cozy', en:'🛋️ Cozy & relaxed', ar:'🛋️ مرتاح وهادئ'},
  {id:'tired', en:'😴 A little tired', ar:'😴 تعبان شوي'},
  {id:'stressed', en:'😤 Need to unwind', ar:'😤 أحتاج للاسترخاء'},
  {id:'excited', en:'🎉 Excited & playful', ar:'🎉 متحمس ومرح'}
];
var _tnNeedOptions = [
  {id:'romance', en:'💕 Deep romance', ar:'💕 رومانسية عميقة'},
  {id:'adventure', en:'🌟 Excitement & adventure', ar:'🌟 إثارة ومغامرة'},
  {id:'calm', en:'🌙 Peace & calm', ar:'🌙 هدوء وسكينة'},
  {id:'laugh', en:'😂 Laughter & fun', ar:'😂 ضحك ومرح'},
  {id:'talk', en:'💬 Deep conversation', ar:'💬 حديث عميق'},
  {id:'surprise', en:'🎲 Surprise us!', ar:'🎲 فاجئونا!'},
  {id:'luxury', en:'👑 Luxury experience', ar:'👑 تجربة فاخرة'},
  {id:'homey', en:'🏠 Stay-in & cozy', ar:'🏠 في البيت وهادئ'}
];
function _tnSelectBtn(cls, id) {
  document.querySelectorAll('.'+cls).forEach(function(b){
    b.style.borderColor='rgba(255,255,255,.1)'; b.style.background='var(--card2)'; b.style.color='var(--text-soft)';
  });
  var sel = document.querySelector('.'+cls+'[data-id="'+id+'"]');
  if(sel){ sel.style.borderColor='var(--rose)'; sel.style.background='rgba(232,132,154,.12)'; sel.style.color='var(--rose)'; }
}
function openTonight() {
  if(_tonightLock) return;
  _tnEnergy=''; _tnNeed=''; tonightHistory=[];
  var sh = getSheet('tn-sh');
  sh.querySelector('.sheet').innerHTML =
    '<div class="sheet-handle"></div>' +
    '<div style="padding:8px 0 16px">' +
      '<div style="text-align:center;margin-bottom:20px">' +
        '<div style="font-size:44px;margin-bottom:10px">🎲</div>' +
        '<div style="font-family:\'Cormorant Garamond\',serif;color:var(--rose);font-size:22px;font-weight:700;margin-bottom:6px">'+(isAr?'وش جوّكم الليلة؟':'What\'s your vibe tonight?')+'</div>' +
        '<div style="font-size:13px;color:var(--text-soft)">'+(isAr?'سؤالان فقط — واقترح الذكاء الاصطناعي ليلتكما المثالية':'2 quick questions → AI crafts your perfect night')+'</div>' +
      '</div>' +
      '<div style="font-size:12px;font-weight:800;color:var(--text-soft);letter-spacing:.06em;margin-bottom:10px">'+(isAr?'١. كيف طاقتكما الآن؟':'1. HOW IS YOUR ENERGY RIGHT NOW?')+'</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px">' +
        _tnEnergyOptions.map(function(o){
          return '<button class="tn-energy-btn" data-id="'+o.id+'" onclick="selectTnEnergy(\''+o.id+'\',this)" style="border:1.5px solid rgba(255,255,255,.1);border-radius:16px;padding:12px 8px;font-size:13px;cursor:pointer;background:var(--card2);color:var(--text-soft);font-family:inherit;text-align:center;transition:all .15s">'+(isAr?o.ar:o.en)+'</button>';
        }).join('') +
      '</div>' +
      '<div style="font-size:12px;font-weight:800;color:var(--text-soft);letter-spacing:.06em;margin-bottom:10px">'+(isAr?'٢. ما يحتاجه قلبكما الليلة؟':'2. WHAT DOES YOUR HEART NEED TONIGHT?')+'</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:22px">' +
        _tnNeedOptions.map(function(o){
          return '<button class="tn-need-btn" data-id="'+o.id+'" onclick="selectTnNeed(\''+o.id+'\',this)" style="border:1.5px solid rgba(255,255,255,.1);border-radius:16px;padding:12px 8px;font-size:13px;cursor:pointer;background:var(--card2);color:var(--text-soft);font-family:inherit;text-align:center;transition:all .15s">'+(isAr?o.ar:o.en)+'</button>';
        }).join('') +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:18px">' +
        TONIGHT_REGIONS.map(function(r){
          return '<button class="tn-region" data-id="'+r.id+'" onclick="selectTonightRegion(\''+r.id+'\',this)" style="border:1.5px solid rgba(255,255,255,.1);border-radius:14px;padding:10px 6px;font-size:11px;cursor:pointer;background:var(--card2);color:var(--text-soft);font-family:inherit;transition:all .15s">'+(isAr?r.ar:r.en)+'</button>';
        }).join('') +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:22px">' +
        TONIGHT_BUDGETS.map(function(b){
          return '<button class="tn-budget" data-id="'+b.id+'" onclick="selectTonightBudget(\''+b.id+'\',this)" style="border:1.5px solid rgba(255,255,255,.1);border-radius:14px;padding:10px 6px;font-size:11px;cursor:pointer;background:var(--card2);color:var(--text-soft);font-family:inherit;transition:all .15s">'+(isAr?b.ar:b.en)+'</button>';
        }).join('') +
      '</div>' +
      '<button class="btn-gold" style="width:100%;padding:15px;font-size:15px;font-weight:800" onclick="generateTonightAI()">'+(isAr?'✨ اقترح ليلتنا':'✨ Craft Our Night')+'</button>' +
    '</div>';
  sh.classList.add('open');
  // Default selections
  setTimeout(function(){
    selectTonightRegion('UAE', document.querySelector('.tn-region[data-id="UAE"]'));
    selectTonightBudget('Medium', document.querySelector('.tn-budget[data-id="Medium"]'));
  }, 80);
}
function selectTnEnergy(id, el) {
  _tnEnergy = id;
  document.querySelectorAll('.tn-energy-btn').forEach(function(b){
    b.style.borderColor='rgba(255,255,255,.1)'; b.style.background='var(--card2)'; b.style.color='var(--text-soft)';
  });
  if(el){ el.style.borderColor='var(--gold)'; el.style.background='rgba(240,204,112,.12)'; el.style.color='var(--gold)'; }
  hap.tap();
}
function selectTnNeed(id, el) {
  _tnNeed = id;
  document.querySelectorAll('.tn-need-btn').forEach(function(b){
    b.style.borderColor='rgba(255,255,255,.1)'; b.style.background='var(--card2)'; b.style.color='var(--text-soft)';
  });
  if(el){ el.style.borderColor='var(--rose)'; el.style.background='rgba(232,132,154,.12)'; el.style.color='var(--rose)'; }
  hap.tap();
}
async function generateTonightAI() {
  if(_tonightLock) return;
  if(!_tnEnergy || !_tnNeed) { T(isAr?'اختر الطاقة والحاجة أولاً':'Please answer both questions first'); hap.error(); return; }
  _tonightLock = true;
  var sh = getSheet('tn-sh');
  sh.querySelector('.sheet').innerHTML =
    '<div class="sheet-handle"></div>' +
    '<div style="text-align:center;padding:40px 20px">' +
      '<div style="font-size:52px;margin-bottom:16px;animation:pulse 1.2s ease infinite">✨</div>' +
      '<div style="font-family:\'Cormorant Garamond\',serif;color:var(--rose);font-size:20px;font-weight:700">'+(isAr?'يُصمَّم اقتراحكما...':'Crafting your perfect night...')+'</div>' +
      '<div style="font-size:13px;color:var(--text-soft);margin-top:8px">'+(isAr?'الذكاء الاصطناعي يحلل مزاجكما 🧠':'AI is reading your vibe 🧠')+'</div>' +
    '</div>';
  sh.classList.add('open');
  var p = profile || {};
  var energyLabel = _tnEnergyOptions.find(function(o){return o.id===_tnEnergy;});
  var needLabel = _tnNeedOptions.find(function(o){return o.id===_tnNeed;});
  var budgetLabel = TONIGHT_BUDGETS.find(function(b){return b.id===tonightBudget;});
  var regionLabel = TONIGHT_REGIONS.find(function(r){return r.id===tonightRegion;});
  var prompt = 'You are a luxury couples experience curator for Gulf families. Create ONE perfect, highly specific date night idea.\n\nCOUPLE PROFILE:\n- Names: '+(p.n1||'Partner A')+' & '+(p.n2||'Partner B')+'\n- Vibe preference: '+(p.vibe||'Romantic')+'\n- Region: '+(regionLabel?(isAr?regionLabel.ar:regionLabel.en):'UAE')+'\n- Budget: '+(budgetLabel?(isAr?budgetLabel.ar:budgetLabel.en):'Medium')+'\n\nTONIGHT\'S MOOD ASSESSMENT:\n- Energy level: '+(energyLabel?(isAr?energyLabel.ar:energyLabel.en):_tnEnergy)+'\n- Heart\'s need: '+(needLabel?(isAr?needLabel.ar:needLabel.en):_tnNeed)+'\n\nDeliver in '+(isAr?'Arabic (العربية)':'English')+' using this EXACT format:\n🌹 [Specific place/activity name]\n📍 [Exact location/area]\n⏰ [Best time to go]\n💰 [Estimated cost in AED]\n✨ [One romantic sentence to say to your partner]\n💕 [Why this is PERFECT for their exact energy+need tonight — 2 sentences max]\n\nBe VERY specific. Name real places if UAE/KSA/Qatar. Never repeat previous suggestions. Make it feel like a top-tier concierge recommendation.';
  try {
    var reply = await callAI([{role:'user',content:prompt}], 'claude-haiku-4-5-20251001');
    sh.querySelector('.sheet').innerHTML =
      '<div class="sheet-handle"></div>' +
      '<div style="padding:12px 0">' +
        '<div style="text-align:center;margin-bottom:18px">' +
          '<div style="font-size:44px;margin-bottom:10px">✨</div>' +
          '<div style="font-family:\'Cormorant Garamond\',serif;color:var(--rose);font-size:22px;font-weight:700">'+(isAr?'اقتراح الليلة':'Tonight\'s Perfect Plan')+'</div>' +
        '</div>' +
        '<div style="background:linear-gradient(135deg,rgba(232,132,154,.08),rgba(201,149,74,.06));border:1px solid rgba(232,132,154,.2);border-radius:20px;padding:20px;margin-bottom:18px;font-size:14px;line-height:1.9;color:var(--text-mid);white-space:pre-line">'+reply.replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</div>' +
        '<div style="display:flex;gap:10px;margin-bottom:10px">' +
          '<button class="btn-gold" style="flex:1;padding:14px;font-size:15px;font-weight:800" onclick="closeSheet(\'tn-sh\');T(isAr?\'استمتعا بليلتكما! 💕\':\'Enjoy your perfect night! 💕\')">'+(isAr?'لنذهب 💕':'Let\'s go 💕')+'</button>' +
          '<button onclick="shareTonightCard()" style="background:rgba(201,149,74,.15);border:1px solid rgba(201,149,74,.4);color:#C9954A;border-radius:50px;padding:14px 16px;font-size:18px;cursor:pointer;flex-shrink:0" title="Share">⬆</button>' +
        '</div>' +
        '<button class="btn-ghost" style="width:100%;padding:12px;font-size:13px" onclick="_tonightLock=false;openTonight()">'+(isAr?'جرب اقتراحاً آخر 🎲':'Try a different idea 🎲')+'</button>' +
      '</div>';
    sh.classList.add('open');
    hap.celebrate();
  } catch(e) {
    // Fallback to curated venues if AI fails
    var candidates = DATE_VENUES.filter(function(v){ return v.region === tonightRegion && v.budget === tonightBudget; });
    if(!candidates.length) candidates = DATE_VENUES.filter(function(v){ return v.region===tonightRegion; });
    if(!candidates.length) candidates = DATE_VENUES;
    var available = candidates.filter(function(v){ return tonightHistory.indexOf(v.place)===-1; });
    if(!available.length){ tonightHistory=[]; available=candidates; }
    var choice = available[Math.floor(Math.random()*available.length)];
    tonightHistory.push(choice.place);
    sh.querySelector('.sheet').innerHTML =
      '<div class="sheet-handle"></div>' +
      '<div style="padding:12px 0">' +
        '<div style="text-align:center;margin-bottom:16px"><div style="font-size:44px">✨</div><div style="font-family:\'Cormorant Garamond\',serif;color:var(--rose);font-size:22px;font-weight:700">'+(isAr?'اقتراح الليلة':'Tonight\'s Suggestion')+'</div></div>' +
        '<div style="background:rgba(255,255,255,.04);border:1px solid rgba(232,132,154,.14);border-radius:20px;padding:18px;margin-bottom:16px">' +
          '<div style="font-size:17px;font-weight:700;color:var(--text);margin-bottom:8px">'+choice.place+' · '+choice.city+'</div>' +
          '<div style="font-size:14px;color:var(--text-soft);line-height:1.7">'+(isAr?choice.ar:choice.en)+'</div>' +
        '</div>' +
        '<button class="btn-gold" style="width:100%;padding:14px;margin-bottom:10px" onclick="closeSheet(\'tn-sh\')">'+(isAr?'لنذهب 💕':'Let\'s go 💕')+'</button>' +
        '<button class="btn-ghost" style="width:100%;padding:12px" onclick="_tonightLock=false;generateTonightAI()">'+(isAr?'جرب آخر':'Try another')+'</button>' +
      '</div>';
    sh.classList.add('open');
    hap.celebrate();
  }
  _tonightLock = false;
}
function generateTonightSuggestion() { _tonightLock=false; generateTonightAI(); }

// ── SHARE TONIGHT CARD ──
async function shareTonightCard() {
  hap.tap();
  var sh = getSheet('tn-sh');
  var resultEl = sh ? sh.querySelector('.sheet') : null;
  if(!resultEl) return;
  // Try Web Share API first (native share sheet on mobile)
  var textContent = resultEl.innerText || resultEl.textContent || '';
  if(navigator.share) {
    try {
      await navigator.share({
        title: isAr ? 'أنا وياك — اقتراح الليلة ✨' : 'Ana Wyak — Tonight\'s Plan ✨',
        text: textContent.slice(0,300) + '\n\n— أنا وياك · anawyak.app',
        url: 'https://anawyak.app'
      });
      T(isAr?'تم المشاركة! 💕':'Shared! 💕'); hap.success();
      return;
    } catch(e) { /* user cancelled or share failed, fall through to image */ }
  }
  // Fallback: html2canvas image share
  if(typeof html2canvas === 'undefined') { T(isAr?'المشاركة غير متاحة على هذا الجهاز':'Share not available on this device'); return; }
  T(isAr?'جاري إنشاء الصورة...':'Generating image...'); hap.tap();
  var cardEl = resultEl.querySelector('[style*="pre-line"]') || resultEl;
  try {
    var canvas = await html2canvas(cardEl, { backgroundColor:'#150D10', scale:2, useCORS:true });
    canvas.toBlob(async function(blob) {
      if(!blob) return;
      var file = new File([blob], 'anawyak-tonight.png', { type:'image/png' });
      if(navigator.canShare && navigator.canShare({ files:[file] })) {
        await navigator.share({ files:[file], title:'Ana Wyak ✨', url:'https://anawyak.app' });
        T(isAr?'تم المشاركة! 💕':'Shared! 💕'); hap.success();
      } else {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'anawyak-tonight.png';
        a.click();
        T(isAr?'تم حفظ الصورة 💕':'Image saved 💕'); hap.success();
      }
    }, 'image/png');
  } catch(e) { T(isAr?'فشل إنشاء الصورة':'Image generation failed'); }
}

// ── GOTCHA MOMENT — live AI before signup (no account needed) ──
var _gotchaLock = false;
async function tryGotchaAI(mood) {
  if(_gotchaLock) return;
  _gotchaLock = true;
  hap.celebrate();
  var resultEl = document.getElementById('gotcha-result');
  var btn = document.getElementById('gotcha-btn');
  if(resultEl) {
    resultEl.innerHTML = '<div style="text-align:center;padding:20px"><div style="font-size:32px;animation:pulse 1s ease infinite">✨</div><div style="font-size:13px;color:rgba(255,255,255,.5);margin-top:8px">'+(isAr?'يُصمَّم اقتراحكم...':'Crafting your perfect night...')+'</div></div>';
    resultEl.style.display = 'block';
  }
  if(btn) btn.style.display = 'none';
  var moodMap = { romantic: isAr?'رومانسي وحالم':'romantic & dreamy', fun: isAr?'مرح وحيوي':'fun & playful', calm: isAr?'هادئ وبسيط':'calm & cozy' };
  var prompt = 'You are a Gulf luxury date concierge. A couple just told you their mood is: ' + (moodMap[mood]||mood) + '. Give ONE specific perfect date idea for tonight in the UAE (Dubai/Sharjah/Abu Dhabi). Format:\n\n🌹 [Place name]\n📍 [Area]\n⏰ [Best time]\n💰 [AED cost]\n✨ [One magical sentence to say to your partner]\n\nBe specific, real, and magical. 3-5 lines only. Language: '+(isAr?'Arabic':'English')+'.';
  var reply = await callAI([{role:'user',content:prompt}], SYS_BASE, true);
  _gotchaLock = false;
  if(resultEl) {
    resultEl.innerHTML =
      '<div style="background:linear-gradient(135deg,rgba(201,149,74,.12),rgba(232,132,154,.08));border:1px solid rgba(201,149,74,.3);border-radius:20px;padding:20px;margin-top:16px">' +
        '<div style="font-size:12px;color:#C9954A;font-weight:700;margin-bottom:10px;letter-spacing:.05em">✦ '+(isAr?'اقتراح الليلة':'TONIGHT\'S PLAN')+'</div>' +
        '<div style="font-size:14px;color:#FAF7F2;line-height:1.9;white-space:pre-line">'+reply.replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</div>' +
        '<div style="margin-top:18px;border-top:1px solid rgba(201,149,74,.2);padding-top:14px;font-size:13px;color:rgba(255,255,255,.5)">'+(isAr?'أعجبك الاقتراح؟ احفظه في عالمكما 💕':'Love it? Save it in your private world 💕')+'</div>' +
      '</div>' +
      '<button onclick="skipToLang()" class="btn-rose" style="width:100%;max-width:320px;margin:16px auto 0;display:block;font-size:15px">'+(isAr?'ابن عالمكما الخاص ← ':'Build Our Private World → ')+'</button>';
  }
  hap.celebrate();
}

// ══════════════════════════════════════════════════
//  REAL-TIME CHAT
// ══════════════════════════════════════════════════
var _chatPollInterval = null;
var _chatLastTs = 0;
var _chatUnread = 0;

function chatKey() {
  var pc = LS.get('aw_partner_code','');
  if(!pc) return null;
  var myCode = (profile && profile.code) || 'ME';
  var sorted = [pc, myCode].sort();
  return 'chat:'+sorted[0]+':'+sorted[1];
}

async function sendChatMsg() {
  var inp = document.getElementById('chat-input');
  var text = (inp ? inp.value.trim() : '');
  if(!text) return;
  var pc = LS.get('aw_partner_code','');
  if(!pc) { T(isAr?'لا يوجد شريك متصل':'No partner linked'); return; }
  inp.value = '';
  var msg = { ts: Date.now(), from: (profile&&profile.n1)||'Me', text: text };
  // Optimistic render
  appendChatBubble(msg, true);
  // Upload to KV
  var key = chatKey();
  if(!key) return;
  var existing = await fetchChatMessages(key) || [];
  existing.push(msg);
  if(existing.length > 100) existing = existing.slice(-100);
  await fetch(DEFAULT_PROXY + '/sync', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ code: key, data: { msgs: existing } })
  }).catch(function(){});
  hap.tap();
}

async function fetchChatMessages(key) {
  try {
    var r = await fetch(DEFAULT_PROXY + '/partner/' + encodeURIComponent(key));
    if(!r.ok) return null;
    var d = await r.json();
    return (d && d.msgs) ? d.msgs : null;
  } catch(e) { return null; }
}

async function pollChatMessages() {
  var key = chatKey();
  if(!key) return;
  var msgs = await fetchChatMessages(key);
  if(!msgs || !msgs.length) return;
  var container = document.getElementById('chat-messages');
  var empty = document.getElementById('chat-empty');
  if(empty) empty.style.display = 'none';
  // Only render new messages since last poll
  var newMsgs = msgs.filter(function(m){ return m.ts > _chatLastTs; });
  if(!newMsgs.length) return;
  newMsgs.forEach(function(m){
    var myName = (profile&&profile.n1)||'Me';
    var isMine = m.from === myName;
    if(!isMine) {
      appendChatBubble(m, false);
      hap.tap();
    }
    if(m.ts > _chatLastTs) _chatLastTs = m.ts;
  });
  if(container) container.scrollTop = container.scrollHeight;
}

async function checkChatUnread() {
  var key = chatKey();
  if(!key) return;
  var msgs = await fetchChatMessages(key);
  if(!msgs) return;
  var myName = (profile&&profile.n1)||'Me';
  var unread = msgs.filter(function(m){ return m.ts > _chatLastTs && m.from !== myName; }).length;
  if(unread > 0) {
    _chatUnread = unread;
    var badge = document.getElementById('chat-badge');
    var fab = document.getElementById('chat-fab');
    if(badge) { badge.textContent = unread; badge.style.display='flex'; }
    if(fab) fab.style.animation = 'heartbeat 1s ease infinite';
  }
}

function appendChatBubble(msg, isMine) {
  var container = document.getElementById('chat-messages');
  if(!container) return;
  var empty = document.getElementById('chat-empty');
  if(empty) empty.style.display = 'none';
  var time = new Date(msg.ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  var div = document.createElement('div');
  div.className = 'msg-row ' + (isMine ? 'mine' : 'theirs');
  div.innerHTML = '<div>' +
    '<div class="msg-bubble">'+esc(msg.text)+'</div>' +
    '<div class="msg-time">'+time+'</div>' +
  '</div>';
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

async function openChatSheet() {
  var pc = LS.get('aw_partner_code','');
  if(!pc) { T(isAr?'اربط شريكك أولاً من الملف الشخصي':'Link your partner first from Profile'); hap.error(); return; }
  var partnerName = document.getElementById('chat-partner-name');
  if(partnerName) partnerName.textContent = LS.get('aw_partner_name', isAr?'شريكك':'Partner');
  _chatUnread = 0;
  var badge = document.getElementById('chat-badge');
  var fab = document.getElementById('chat-fab');
  if(badge) badge.style.display='none';
  if(fab) fab.style.animation='';
  // Load existing messages
  var container = document.getElementById('chat-messages');
  if(container) container.innerHTML = '<div class="empty-state-v2" id="chat-empty"><div class="es-icon">💌</div><div class="es-title">'+(isAr?'ابدأ محادثتكما':'Start your conversation')+'</div><div class="es-sub">'+(isAr?'الرسائل تصل لشريكك فوراً':'Messages sync instantly with your partner')+'</div></div>';
  openSheet('chat-sh');
  var key = chatKey();
  if(key) {
    var msgs = await fetchChatMessages(key);
    if(msgs && msgs.length) {
      var myName = (profile&&profile.n1)||'Me';
      var empty = document.getElementById('chat-empty');
      if(empty) empty.style.display='none';
      msgs.forEach(function(m){
        var isMine = m.from === myName;
        appendChatBubble(m, isMine);
        if(m.ts > _chatLastTs) _chatLastTs = m.ts;
      });
    }
  }
  setTimeout(function(){
    var inp = document.getElementById('chat-input');
    if(inp) inp.focus();
  }, 400);
}

function closeChatSheet() {
  closeSheet('chat-sh');
}

// ══════════════════════════════════════════════════
//  APP INITIALISATION
// ══════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', function() {
  // Apply saved theme/lang before splash fades
  if(LS.get('aw_theme','light') === 'dark') document.body.classList.add('dark');
  if(LS.get('aw_lang', false)) {
    document.body.classList.add('rtl');
    document.documentElement.dir = 'rtl';
    isAr = true;
  }

  // After 2.5 s splash → route to correct screen
  setTimeout(function(){
    var splash = document.getElementById('splash');
    if(splash) {
      splash.style.transition = 'opacity .5s ease';
      splash.style.opacity = '0';
      setTimeout(function(){ splash.style.display='none'; }, 500);
    }
    profile = LS.get('aw_profile', null);
    // Founder link: if admin param activated but no profile, auto-create founder profile
    if(!profile && isAdmin()){
      profile = {n1:'Founder',n2:'Ana Wyak',rel:'couple',vibe:'romantic',code:'FOUNDER',verified:true};
      LS.set('aw_profile', profile);
      var founderAcct = {email:'founder@anawyak.app',hash:'',profile:profile,verified:true};
      var accts = LS.get('aw_accounts',[]);
      if(!accts.find(function(a){return a.email===founderAcct.email;})) accts.push(founderAcct);
      LS.set('aw_accounts', accts);
      LS.set('aw_lang_chosen', true);
    }
    if(profile) {
      launchApp();
      // Handle manifest shortcut deeplinks (?tab=coach etc.)
      var params = new URLSearchParams(window.location.search);
      var startTab = params.get('tab');
      if(startTab && ['home','coach','cook','dates','memories','profile'].includes(startTab)) {
        setTimeout(function(){ showTab(startTab); }, 300);
      }
      if(isAdmin()) setTimeout(function(){ T('👑 Welcome, Founder — Admin Mode Active',3000); hap.celebrate(); }, 600);
    } else {
      obMode = 'pre'; obStep = 0; obVibe = ''; obWish = '';
      var ob = document.getElementById('onboarding');
      if(ob) ob.style.display = 'block';
      ['ob-preview','ob-lang','ob-0','ob-1','ob-2','ob-3'].forEach(function(id){
        var el = document.getElementById(id); if(el) el.style.display = 'none';
      });
      if(LS.get('aw_lang_chosen', false)) {
        // Returning partial session — skip preview and lang
        var ob0 = document.getElementById('ob-0');
        if(ob0) ob0.style.display = 'flex';
        var fill = document.getElementById('ob-fill'); if(fill) fill.style.width = '33%';
      } else {
        // Brand new user — show 30-second demo preview first
        startDemoPreview();
      }
    }
  }, 2500);
});
