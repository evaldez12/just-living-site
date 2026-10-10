/**
 * Just Living — Stripe checkout worker (Cloudflare Workers, free tier).
 *
 * The website is static (GitHub Pages), so this is the one piece of server code:
 * it receives the cart, creates a Stripe Checkout Session with the client's SECRET key,
 * and returns the Checkout URL. The secret key never touches the website.
 *
 * Deploy (one time):
 *   1. Cloudflare dashboard → Workers & Pages → Create → Worker → paste this file → Deploy.
 *   2. Worker → Settings → Variables → add:
 *        STRIPE_SECRET_KEY = sk_live_...   (from the client's Stripe dashboard, Developers → API keys)
 *        SITE_URL          = https://justlivingnyc.com
 *        ALLOWED_ORIGINS   = https://justlivingnyc.com,https://www.justlivingnyc.com
 *      Mark STRIPE_SECRET_KEY as a secret (encrypt).
 *   3. Copy the worker URL (https://jl-checkout.<account>.workers.dev) into js/config.js → CHECKOUT_ENDPOINT.
 *
 * Request:  POST { items: [{ price: "price_...", quantity: 1 }] }
 * Response: { url: "https://checkout.stripe.com/..." }
 */
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    const cors = {
      'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : (allowed[0] || '*'),
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: cors });
    if (!env.STRIPE_SECRET_KEY) return new Response(JSON.stringify({ error: 'Stripe key not configured' }), { status: 500, headers: cors });

    let items = [];
    try { items = (await request.json()).items || []; } catch { /* fall through */ }
    items = items.filter(i => typeof i.price === 'string' && i.price.startsWith('price_') && Number.isInteger(i.quantity) && i.quantity > 0 && i.quantity <= 10).slice(0, 20);
    if (!items.length) return new Response(JSON.stringify({ error: 'Cart is empty' }), { status: 400, headers: cors });

    const site = env.SITE_URL || origin;
    const form = new URLSearchParams();
    form.set('mode', 'payment');
    form.set('success_url', `${site}/thanks.html?session_id={CHECKOUT_SESSION_ID}`);
    form.set('cancel_url', `${site}/#shop`);
    form.set('allow_promotion_codes', 'true');
    form.set('billing_address_collection', 'auto');
    form.set('phone_number_collection[enabled]', 'true');
    form.set('shipping_address_collection[allowed_countries][0]', 'US');
    form.set('shipping_address_collection[allowed_countries][1]', 'CA');
    // Shipping options: edit amounts (in cents) to match info.html. Free over $150 handled by the second option.
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

    const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    });
    const data = await r.json();
    if (!r.ok) return new Response(JSON.stringify({ error: data.error?.message || 'Stripe error' }), { status: 502, headers: cors });
    return new Response(JSON.stringify({ url: data.url }), { headers: cors });
  },
};
