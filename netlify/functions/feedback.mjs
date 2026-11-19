// Anonymous feedback → Telegram.
// Env vars (Netlify → Site configuration → Environment variables):
//   TELEGRAM_BOT_TOKEN   token from @BotFather (required)
//   TELEGRAM_CHAT_ID     your chat id (required)
//   TURNSTILE_SITE_KEY   Cloudflare Turnstile site key (optional, enables captcha)
//   TURNSTILE_SECRET_KEY Cloudflare Turnstile secret key (optional, enables captcha)

const MAX_MESSAGE = 2000;
const MAX_CONTACT = 100;
const MIN_FILL_MS = 3000;

const json = (status, body) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max + 1) : '');

async function turnstileOk(secret, token) {
    if (!token) return false;
    const form = new URLSearchParams({ secret, response: token });
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
    const data = await res.json().catch(() => ({}));
    return data.success === true;
}

export default async (req) => {
    const env = (k) => process.env[k];

    if (req.method === 'GET') return json(200, { turnstileSiteKey: env('TURNSTILE_SITE_KEY') || null });
    if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

    const botToken = env('TELEGRAM_BOT_TOKEN');
    const chatId = env('TELEGRAM_CHAT_ID');
    if (!botToken || !chatId) return json(503, { error: 'not_configured' });

    let body;
    try { body = await req.json(); } catch { return json(400, { error: 'bad_request' }); }
    if (!body || typeof body !== 'object') return json(400, { error: 'bad_request' });

    // Bots that fill the hidden field or submit instantly get a fake success so they learn nothing.
    if (body.website || !(Number(body.elapsed) >= MIN_FILL_MS)) return json(200, { ok: true });

    const message = str(body.message, MAX_MESSAGE);
    const contact = str(body.contact, MAX_CONTACT);
    const lang = str(body.lang, 5);
    if (!message || message.length > MAX_MESSAGE || contact.length > MAX_CONTACT) return json(400, { error: 'invalid' });

    const secret = env('TURNSTILE_SECRET_KEY');
    if (secret && !(await turnstileOk(secret, str(body.turnstileToken, 4096)))) return json(403, { error: 'captcha' });

    const lines = ['💬 Room Planner', '', message, '', `Contact: ${contact || '—'}`];
    if (lang) lines.push(`Lang: ${lang}`);
    const text = lines.join('\n');

    const tg = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
    if (!tg.ok) return json(502, { error: 'telegram' });
    return json(200, { ok: true });
};

export const config = {
    path: '/api/feedback',
    rateLimit: { windowLimit: 5, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
