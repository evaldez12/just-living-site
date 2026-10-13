/**
 * Just Living — site Worker.
 * Static files are served by Cloudflare's asset handling (see wrangler.jsonc). This script only
 * answers /api/* :
 *
 *   POST /api/subscribe                 restock / drop waitlist signup (from the site)
 *   GET  /api/unsubscribe?t=<token>     one-click unsubscribe (link in every email)
 *   POST /api/checkout                  Stripe Checkout session for the cart
 *   GET  /api/admin/summary             counts per product/size          (admin key)
 *   GET  /api/admin/subscribers         full list, ?product= filter      (admin key)
 *   GET  /api/admin/export.csv          CSV download                     (admin key)
 *   DELETE /api/admin/subscribers/:id   remove one                       (admin key)
 *   POST /api/admin/send                email everyone waiting for a product via Resend (admin key)
 *
 * Bindings / secrets (wrangler.jsonc + `wrangler secret put`):
 *   DB                 D1 database "jl-waitlist"
 *   ADMIN_KEY          secret: the owner's key for /admin
 *   RESEND_API_KEY     secret: Resend key once the sending domain is verified (optional until then)
 *   MAIL_FROM          var:  e.g. "Just Living <drops@justlivingnyc.com>"
 *   SITE_URL           var:  e.g. "https://justlivingnyc.com"
 *   STRIPE_SECRET_KEY  secret: optional until the client's Stripe account exists
 */

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function normalizeContact(raw) {
  const c = String(raw || '').trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c)) return { contact: c.toLowerCase(), kind: 'email' };
  const digits = c.replace(/[^\d+]/g, '');
  const n = digits.startsWith('+') ? digits : (digits.length === 10 ? '+1' + digits : (digits.length === 11 && digits.startsWith('1') ? '+' + digits : ''));
  if (/^\+\d{10,15}$/.test(n)) return { contact: n, kind: 'phone' };
  return null;
}

// unsubscribe tokens: HMAC(id) with the admin key, so links can't be forged or guessed
async function hmac(env, msg) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.ADMIN_KEY || 'dev'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(String(msg)));
  return [...new Uint8Array(sig)].slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
}
const unsubToken = async (env, id) => `${id}.${await hmac(env, 'unsub:' + id)}`;

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let out = 0; for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i); return out === 0;
}
function isAdmin(request, env) {
  const h = request.headers.get('Authorization') || '';
  return !!env.ADMIN_KEY && timingSafeEqual(h.replace(/^Bearer\s+/i, ''), env.ADMIN_KEY);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);

    try {
      // ---------- public ----------
      if (path === '/api/subscribe' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const n = normalizeContact(body.contact);
        if (!n) return json({ error: 'Enter a valid email or phone number.' }, 400);
        const product = String(body.product || 'next-drop').slice(0, 80);
        const size = String(body.size || 'any').slice(0, 20);
        const source = String(body.source || 'site').slice(0, 40);
        await env.DB.prepare(
          `INSERT INTO subscribers (contact, kind, product, size, source) VALUES (?1, ?2, ?3, ?4, ?5)
           ON CONFLICT (contact, product, size) DO UPDATE SET unsubscribed_at = NULL, created_at = datetime('now')`
        ).bind(n.contact, n.kind, product, size, source).run();
        return json({ ok: true, kind: n.kind });
      }

      if (path === '/api/unsubscribe' && request.method === 'GET') {
        const t = url.searchParams.get('t') || '';
        const [id, sig] = t.split('.');
        if (!id || !timingSafeEqual(sig || '', await hmac(env, 'unsub:' + id))) return new Response('Invalid link.', { status: 400 });
        const row = await env.DB.prepare('SELECT contact FROM subscribers WHERE id = ?1').bind(id).first();
        if (row) await env.DB.prepare("UPDATE subscribers SET unsubscribed_at = datetime('now') WHERE contact = ?1").bind(row.contact).run();
        return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="background:#070707;color:#ece6d8;font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><h1 style="font-weight:600">You're off the list.</h1><p>No more drop messages. <a href="${esc(env.SITE_URL || '/')}" style="color:#ece6d8">Back to Just Living</a></p></div>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }

      if (path === '/api/checkout' && request.method === 'POST') return checkout(request, env, url);

      // ---------- admin ----------
      if (path.startsWith('/api/admin/')) {
        if (!isAdmin(request, env)) return json({ error: 'Unauthorized' }, 401);

        if (path === '/api/admin/summary') {
          const { results } = await env.DB.prepare(
            `SELECT product, size, kind, COUNT(*) AS n FROM subscribers WHERE unsubscribed_at IS NULL GROUP BY product, size, kind ORDER BY product, size`).all();
          const totals = await env.DB.prepare(
            `SELECT COUNT(*) AS total, SUM(kind='email') AS emails, SUM(kind='phone') AS phones, COUNT(DISTINCT contact) AS people FROM subscribers WHERE unsubscribed_at IS NULL`).first();
          const sends = (await env.DB.prepare('SELECT * FROM sends ORDER BY id DESC LIMIT 20').all()).results;
          return json({ rows: results, totals, sends, mail: !!env.RESEND_API_KEY });
        }
        if (path === '/api/admin/subscribers' && request.method === 'GET') {
          const product = url.searchParams.get('product');
          const q = product
            ? env.DB.prepare('SELECT * FROM subscribers WHERE product = ?1 ORDER BY id DESC LIMIT 2000').bind(product)
            : env.DB.prepare('SELECT * FROM subscribers ORDER BY id DESC LIMIT 2000');
          return json({ rows: (await q.all()).results });
        }
        if (path === '/api/admin/export.csv') {
          const { results } = await env.DB.prepare('SELECT id, contact, kind, product, size, source, created_at, unsubscribed_at FROM subscribers ORDER BY id').all();
          const csv = ['id,contact,kind,product,size,source,created_at,unsubscribed_at', ...results.map(r => [r.id, r.contact, r.kind, r.product, r.size, r.source, r.created_at, r.unsubscribed_at || ''].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
          return new Response(csv, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="just-living-waitlist.csv"' } });
        }
        const del = path.match(/^\/api\/admin\/subscribers\/(\d+)$/);
        if (del && request.method === 'DELETE') {
          await env.DB.prepare('DELETE FROM subscribers WHERE id = ?1').bind(del[1]).run();
          return json({ ok: true });
        }
        if (path === '/api/admin/send' && request.method === 'POST') return sendCampaign(request, env);
      }
      return json({ error: 'Not found' }, 404);
    } catch (err) {
      return json({ error: 'Server error: ' + (err.message || err) }, 500);
    }
  },
};

// ---------- email (Resend) ----------
async function sendCampaign(request, env) {
  if (!env.RESEND_API_KEY) return json({ error: 'Email is not connected yet: add the RESEND_API_KEY secret and MAIL_FROM (see LAUNCH.md).' }, 400);
  const body = await request.json().catch(() => ({}));
  const product = String(body.product || 'next-drop');
  const subject = String(body.subject || '').trim(), text = String(body.message || '').trim();
  const test = body.test ? normalizeContact(body.test) : null;
  if (!subject || !text) return json({ error: 'Subject and message are required.' }, 400);

  let rows;
  if (test) rows = [{ id: 0, contact: test.contact }];
  else {
    const q = product === 'all'
      ? env.DB.prepare("SELECT MIN(id) AS id, contact FROM subscribers WHERE kind='email' AND unsubscribed_at IS NULL GROUP BY contact")
      : env.DB.prepare("SELECT MIN(id) AS id, contact FROM subscribers WHERE kind='email' AND unsubscribed_at IS NULL AND (product = ?1 OR product = 'next-drop') GROUP BY contact").bind(product);
    rows = (await q.all()).results;
  }
  if (!rows.length) return json({ error: 'Nobody with an email address is waiting for that.' }, 400);

  const site = env.SITE_URL || new URL(request.url).origin;
  const messages = [];
  for (const r of rows) {
    const unsub = `${site}/api/unsubscribe?t=${await unsubToken(env, r.id)}`;
    messages.push({
      from: env.MAIL_FROM || 'Just Living <onboarding@resend.dev>', to: [r.contact], subject,
      text: `${text}\n\n—\nJust Living, New York\nUnsubscribe: ${unsub}`,
      html: `<div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 20px;color:#111"><p style="white-space:pre-wrap;font-size:16px;line-height:1.6">${esc(text)}</p><p style="margin-top:36px;font-size:12px;color:#777">Just Living, New York · <a href="${unsub}" style="color:#777">Unsubscribe</a></p></div>`,
      headers: { 'List-Unsubscribe': `<${unsub}>` },
    });
  }
  let sent = 0;
  for (let i = 0; i < messages.length; i += 100) {
    const r = await fetch('https://api.resend.com/emails/batch', { method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(messages.slice(i, i + 100)) });
    if (!r.ok) return json({ error: 'Resend error: ' + (await r.text()).slice(0, 300), sent }, 502);
    sent += Math.min(100, messages.length - i);
  }
  if (!test) await env.DB.prepare('INSERT INTO sends (product, subject, body, recipients) VALUES (?1, ?2, ?3, ?4)').bind(product, subject, text, sent).run();
  return json({ ok: true, sent });
}

// ---------- Stripe Checkout ----------
async function checkout(request, env, url) {
  if (!env.STRIPE_SECRET_KEY) return json({ error: 'Checkout is not connected yet (STRIPE_SECRET_KEY secret).' }, 400);
  let items = [];
  try { items = (await request.json()).items || []; } catch { /* empty cart */ }
  items = items.filter(i => typeof i.price === 'string' && i.price.startsWith('price_') && Number.isInteger(i.quantity) && i.quantity > 0 && i.quantity <= 10).slice(0, 20);
  if (!items.length) return json({ error: 'Cart is empty' }, 400);
  const site = env.SITE_URL || url.origin;
  const form = new URLSearchParams();
  form.set('mode', 'payment');
  form.set('success_url', `${site}/thanks?session_id={CHECKOUT_SESSION_ID}`);
  form.set('cancel_url', `${site}/#shop`);
  form.set('allow_promotion_codes', 'true');
  form.set('billing_address_collection', 'auto');
  form.set('phone_number_collection[enabled]', 'true');
  form.set('shipping_address_collection[allowed_countries][0]', 'US');
  form.set('shipping_address_collection[allowed_countries][1]', 'CA');
  form.set('shipping_options[0][shipping_rate_data][type]', 'fixed_amount');
  form.set('shipping_options[0][shipping_rate_data][fixed_amount][amount]', '800');
  form.set('shipping_options[0][shipping_rate_data][fixed_amount][currency]', 'usd');
  form.set('shipping_options[0][shipping_rate_data][display_name]', 'US shipping (2–5 days)');
  items.forEach((it, i) => {
    form.set(`line_items[${i}][price]`, it.price);
    form.set(`line_items[${i}][quantity]`, String(it.quantity));
    form.set(`line_items[${i}][adjustable_quantity][enabled]`, 'true');
    form.set(`line_items[${i}][adjustable_quantity][minimum]`, '0');
    form.set(`line_items[${i}][adjustable_quantity][maximum]`, '10');
  });
  const r = await fetch('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
  const data = await r.json();
  if (!r.ok) return json({ error: data.error?.message || 'Stripe error' }, 502);
  return json({ url: data.url });
}
