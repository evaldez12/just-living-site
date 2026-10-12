// Just Living — store runtime: product grid, cart drawer, restock alerts, countdown,
// mobile menu, analytics and Instagram wall. Shared by the home page and product pages.
import { CONFIG } from './config.js';

export const SIZE_CHARTS = {
  tee: { title: 'Tees (inches, laid flat)', head: ['Size', 'Chest', 'Length', 'Shoulder'],
    rows: [['S', '22', '27.5', '22'], ['M', '23', '28.5', '23'], ['L', '24', '29.5', '24'], ['XL', '25', '30.5', '25'], ['XXL', '26', '31.5', '26']],
    note: 'Boxy fit. Size down for a regular fit. Sample measurements, replace with the factory spec sheet.' },
  shoe: { title: 'Sneakers (US men\'s)', head: ['US', 'EU', 'UK', 'CM'],
    rows: [['7', '40', '6', '25'], ['8', '41', '7', '26'], ['9', '42', '8', '27'], ['10', '43', '9', '28'], ['11', '44', '10', '29'], ['12', '45', '11', '30'], ['13', '46', '12', '31']],
    note: 'True to size. Half sizes go up.' },
  hat: { title: 'Hats', head: ['Size', 'Fits'], rows: [['One size', 'Adjustable snapback, 22 to 24 in']], note: '' },
};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const money = n => '$' + Number(n).toFixed(n % 1 ? 2 : 0);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let PRODUCTS = [];
export async function loadProducts() {
  if (PRODUCTS.length) return PRODUCTS;
  const r = await fetch('products.json');
  PRODUCTS = await r.json();
  return PRODUCTS;
}
export const productById = id => PRODUCTS.find(p => p.id === id);
export const productUrl = p => `product-${p.id}.html`;
export const imgUrl = f => `assets/products/${f}`;

/* ---------------- product grid ---------------- */
export function renderGrid(container, products) {
  container.innerHTML = products.map(p => `
    <article class="product rv in" data-cat="${p.category}">
      ${p.soldOut ? '<span class="tagp out">Sold out</span>' : (p.badge ? `<span class="tagp">${esc(p.badge)}</span>` : '')}
      <a class="media" data-tilt href="${productUrl(p)}" aria-label="${esc(p.name)}">
        <img src="${imgUrl(p.images[0])}" alt="${esc(p.name)}" loading="lazy">
        ${p.images[1] ? `<img class="alt" src="${imgUrl(p.images[1])}" alt="" loading="lazy">` : ''}
      </a>
      <div class="info">
        <div><b><a href="${productUrl(p)}">${esc(p.name)}</a></b><small>${esc(p.color)}</small></div>
        <div class="right">
          <span class="price${p.soldOut ? ' gone' : ''}">${money(p.price)}</span>
          ${p.soldOut ? `<button class="mini" data-notify="${p.id}">Notify me</button>` : `<button class="mini solid" data-add="${p.id}">Add</button>`}
        </div>
      </div>
    </article>`).join('');
  tilt(container);
}
export function bindFilters(bar, container) {
  $$('button', bar).forEach(b => b.addEventListener('click', () => {
    $$('button', bar).forEach(x => x.classList.toggle('on', x === b));
    $$('.product', container).forEach(p => { p.style.display = (b.dataset.f === 'all' || p.dataset.cat === b.dataset.f) ? '' : 'none'; });
  }));
}
export function tilt(root = document) {
  $$('[data-tilt]', root).forEach(el => {
    el.addEventListener('pointermove', e => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      el.style.transform = `rotateY(${x * 14}deg) rotateX(${-y * 14}deg) scale(1.02)`;
    });
    el.addEventListener('pointerleave', () => { el.style.transform = ''; });
  });
}

/* ---------------- cart ---------------- */
const CART_KEY = 'jl-cart';
const readCart = () => { try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); } catch { return []; } };
const writeCart = c => { try { localStorage.setItem(CART_KEY, JSON.stringify(c)); } catch {} updateCartCount(); };
export const cartCount = () => readCart().reduce((n, l) => n + l.qty, 0);
function updateCartCount() { $$('[data-cart-count]').forEach(el => { el.textContent = `CART (${cartCount()})`; }); }

export function addToCart(id, size, qty = 1) {
  const p = productById(id); if (!p || p.soldOut) return false;
  const cart = readCart();
  const line = cart.find(l => l.id === id && l.size === size);
  line ? line.qty += qty : cart.push({ id, size, qty });
  writeCart(cart); openCart(); return true;
}
export function clearCart() { writeCart([]); }
function removeLine(i) { const c = readCart(); c.splice(i, 1); writeCart(c); renderCart(); }

function cartMarkup() {
  return `
  <div class="drawer-back" data-close-cart></div>
  <aside class="drawer" id="cart" aria-label="Cart">
    <header><span class="pixel">Your cart</span><button class="x" data-close-cart aria-label="Close">×</button></header>
    <div class="lines" id="cart-lines"></div>
    <footer>
      <div class="total"><span>Subtotal</span><b id="cart-total">$0</b></div>
      <button class="btn solid wide" id="cart-checkout">Checkout</button>
      <p class="pixel" id="cart-note"></p>
    </footer>
  </aside>
  <div class="drawer-back" data-close-notify></div>
  <aside class="drawer" id="notify" aria-label="Restock alert">
    <header><span class="pixel">Restock alert</span><button class="x" data-close-notify aria-label="Close">×</button></header>
    <div class="lines">
      <p id="notify-title" class="big"></p>
      <p class="dim">Drop your email or number. One message when it's back, nothing else.</p>
      <form id="notify-form">
        <input id="notify-contact" type="text" inputmode="email" placeholder="Email or phone" required autocomplete="email">
        <select id="notify-size" aria-label="Size"></select>
        <button class="btn solid wide" type="submit">Notify me</button>
      </form>
      <p class="pixel" id="notify-msg"></p>
    </div>
  </aside>`;
}
export function openCart() { renderCart(); document.body.classList.add('cart-open'); }
export function closeCart() { document.body.classList.remove('cart-open'); }
function renderCart() {
  const cart = readCart(), box = $('#cart-lines');
  if (!box) return;
  if (!cart.length) { box.innerHTML = '<p class="dim">Nothing in here yet.</p>'; $('#cart-total').textContent = '$0'; }
  else {
    box.innerHTML = cart.map((l, i) => { const p = productById(l.id); return p ? `
      <div class="line">
        <img src="${imgUrl(p.images[0])}" alt="">
        <div><b>${esc(p.name)}</b><small>${esc(l.size)} · ×${l.qty}</small></div>
        <span>${money(p.price * l.qty)}</span>
        <button class="x" data-remove="${i}" aria-label="Remove">×</button>
      </div>` : ''; }).join('');
    $('#cart-total').textContent = money(cart.reduce((s, l) => s + (productById(l.id)?.price || 0) * l.qty, 0));
    $$('[data-remove]', box).forEach(b => b.addEventListener('click', () => removeLine(+b.dataset.remove)));
  }
  const note = $('#cart-note');
  note.textContent = CONFIG.CHECKOUT_ENDPOINT ? 'Secure checkout by Stripe. Shipping and tax calculated at checkout.' : 'Checkout opens once Stripe is connected (see LAUNCH.md).';
}
async function checkout() {
  const cart = readCart(); if (!cart.length) return;
  const note = $('#cart-note'), btn = $('#cart-checkout');
  if (!CONFIG.CHECKOUT_ENDPOINT) { note.textContent = 'Not connected yet: deploy worker/checkout.js and set CHECKOUT_ENDPOINT in js/config.js.'; return; }
  const items = cart.map(l => ({ price: productById(l.id)?.variants?.[l.size], quantity: l.qty })).filter(i => i.price);
  if (items.length !== cart.length) { note.textContent = 'An item in the cart has no Stripe price ID yet (products.json → variants).'; return; }
  btn.disabled = true; note.textContent = 'Opening secure checkout…';
  try {
    const r = await fetch(CONFIG.CHECKOUT_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) });
    const data = await r.json();
    if (!r.ok || !data.url) throw new Error(data.error || 'Checkout is unavailable right now.');
    location.href = data.url;
  } catch (err) { note.textContent = err.message; btn.disabled = false; }
}

/* ---------------- restock alerts ---------------- */
export function openNotify(id) {
  const p = productById(id);
  $('#notify-title').textContent = p ? `${p.name} · ${p.color}` : 'Next drop';
  const sel = $('#notify-size');
  sel.innerHTML = p ? `<option value="">Any size</option>` + p.sizes.map(s => `<option>${esc(s)}</option>`).join('') : '<option value="">Any</option>';
  sel.style.display = p ? '' : 'none';
  $('#notify-form').dataset.product = id || '';
  $('#notify-msg').textContent = '';
  document.body.classList.add('notify-open');
  setTimeout(() => $('#notify-contact').focus(), 50);
}
function closeNotify() { document.body.classList.remove('notify-open'); }

export async function subscribe(contact, props = {}) {
  const isEmail = /\S+@\S+\.\S+/.test(contact);
  const phone = contact.replace(/[^\d+]/g, '');
  if (!isEmail && phone.replace(/\D/g, '').length < 10) throw new Error('Enter a valid email or phone number.');
  // always keep a local copy so nothing is lost before Klaviyo is connected
  try {
    const list = JSON.parse(localStorage.getItem('jl-alerts') || '[]');
    list.push({ contact, ...props, at: new Date().toISOString() });
    localStorage.setItem('jl-alerts', JSON.stringify(list));
  } catch {}
  if (!CONFIG.KLAVIYO_COMPANY_ID || !CONFIG.KLAVIYO_LIST_ID) return { saved: 'local' };
  const attrs = isEmail ? { email: contact } : { phone_number: phone.startsWith('+') ? phone : '+1' + phone.replace(/\D/g, '') };
  const body = { data: { type: 'subscription', attributes: {
    custom_source: 'Website restock alert',
    profile: { data: { type: 'profile', attributes: { ...attrs, properties: props } } },
  }, relationships: { list: { data: { type: 'list', id: CONFIG.KLAVIYO_LIST_ID } } } } };
  const r = await fetch(`https://a.klaviyo.com/client/subscriptions/?company_id=${CONFIG.KLAVIYO_COMPANY_ID}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', revision: '2024-10-15' }, body: JSON.stringify(body),
  });
  if (!r.ok && r.status !== 202) throw new Error('Could not reach the alerts service. Try again in a minute.');
  return { saved: 'klaviyo' };
}
function bindNotifyForm() {
  $('#notify-form').addEventListener('submit', async e => {
    e.preventDefault();
    const msg = $('#notify-msg'), contact = $('#notify-contact').value.trim();
    const product = e.target.dataset.product, size = $('#notify-size').value;
    try {
      const res = await subscribe(contact, { restock_product: product || 'next-drop', restock_size: size || 'any' });
      msg.textContent = res.saved === 'klaviyo' ? "You're on the list." : "Saved. (Connect Klaviyo in js/config.js to send real texts and emails.)";
      $('#notify-contact').value = '';
    } catch (err) { msg.textContent = err.message; }
  });
}

/* ---------------- countdown ---------------- */
export function countdown(el) {
  if (!el) return;
  if (!CONFIG.NEXT_DROP) {
    el.innerHTML = `<span class="pixel">Next drop</span><b>Date TBA</b><button class="mini" data-notify="">Get the alert</button>`;
    return;
  }
  const target = new Date(CONFIG.NEXT_DROP).getTime();
  const name = CONFIG.NEXT_DROP_NAME ? esc(CONFIG.NEXT_DROP_NAME) + ' · ' : '';
  const tick = () => {
    let d = Math.max(0, target - Date.now());
    const days = Math.floor(d / 864e5); d -= days * 864e5;
    const h = Math.floor(d / 36e5); d -= h * 36e5;
    const m = Math.floor(d / 6e4); d -= m * 6e4;
    const s = Math.floor(d / 1e3);
    const pad = n => String(n).padStart(2, '0');
    el.innerHTML = target > Date.now()
      ? `<span class="pixel">${name}Next drop in</span><b class="num">${days}d ${pad(h)}:${pad(m)}:${pad(s)}</b><button class="mini" data-notify="">Get the alert</button>`
      : `<span class="pixel">${name}</span><b>Live now</b><a class="mini" href="#shop">Shop</a>`;
  };
  tick(); setInterval(tick, 1000);
}

/* ---------------- misc ---------------- */
export function supportsWebGL() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}
function analytics() {
  if (!CONFIG.PLAUSIBLE_DOMAIN) return;
  const s = document.createElement('script'); s.defer = true; s.dataset.domain = CONFIG.PLAUSIBLE_DOMAIN;
  s.src = 'https://plausible.io/js/script.js'; document.head.appendChild(s);
}
function instagramWall() {
  const el = $('#igwall'); if (!el || !CONFIG.BEHOLD_FEED_ID) return;
  el.innerHTML = `<div data-behold-id="${esc(CONFIG.BEHOLD_FEED_ID)}"></div>`;
  const s = document.createElement('script'); s.src = 'https://w.behold.so/widget.js'; s.type = 'module'; document.head.appendChild(s);
}
function mobileMenu() {
  const nav = $('.nav'), burger = $('.burger'); if (!nav || !burger) return;
  burger.addEventListener('click', () => nav.classList.toggle('open'));
  $$('.nav ul a').forEach(a => a.addEventListener('click', () => nav.classList.remove('open')));
}

/* ---------------- boot ---------------- */
export async function initStore() {
  await loadProducts();
  document.body.insertAdjacentHTML('beforeend', cartMarkup());
  updateCartCount();
  $$('[data-cart-count]').forEach(el => el.addEventListener('click', e => { e.preventDefault(); openCart(); }));
  $$('[data-close-cart]').forEach(el => el.addEventListener('click', closeCart));
  $$('[data-close-notify]').forEach(el => el.addEventListener('click', closeNotify));
  $('#cart-checkout').addEventListener('click', checkout);
  bindNotifyForm();
  document.addEventListener('click', e => {
    const n = e.target.closest('[data-notify]'); if (n) { e.preventDefault(); openNotify(n.dataset.notify); return; }
    const a = e.target.closest('[data-add]'); if (a) { e.preventDefault(); addToCart(a.dataset.add, a.dataset.size || productById(a.dataset.add)?.sizes?.[0] || ''); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeCart(); closeNotify(); } });
  mobileMenu(); analytics(); instagramWall();
  countdown($('#countdown'));
  return PRODUCTS;
}
