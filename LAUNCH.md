# Just Living — launch checklist

Plan: Ed hosts the site on GitHub Pages and bills a hosting fee, the client opens a Stripe
account for payments, Ed buys and connects the domain. Everything in the site already works
without accounts (cart stays in the browser, restock alerts are saved locally); these are
the steps that connect it to the real world. Each one is a single value in `js/config.js`
or `products.json`.

## 1. Host on GitHub Pages (Ed)
1. Create a repo (private is fine) and push this `justliving` folder as the root.
   `.nojekyll` is already there so GitHub serves the files as-is.
2. Repo → Settings → Pages → Source: Deploy from branch → `main` / root. The site is live at
   `https://<user>.github.io/<repo>/` within a minute.
3. Every push to `main` redeploys. Before pushing, run `docpython tools/build.py` whenever
   `products.json`, `index.html` or `css/site.css` changed (it regenerates the product pages).

## 2. Domain (Ed)
justlivingnyc.com is parked, so it has either expired or been dropped. Check it at a
registrar (Cloudflare Registrar is at-cost, about $10/yr for .com). If it's gone, consider
`justliving.nyc` or `justlivingnyc.co` as fallbacks and ask the client which they prefer.
1. Buy the domain. In its DNS add:
   - `A` records for `@` → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - `CNAME` for `www` → `<user>.github.io`
2. Rename `CNAME.example` to `CNAME` with the bare domain inside, commit and push.
3. Repo → Settings → Pages → Custom domain → enter the domain, wait for the check, tick
   "Enforce HTTPS".
4. Update `SITE_URL` in `js/config.js` and the og:image URL in `index.html` to the full
   `https://` address (social previews need absolute URLs).

## 3. Payments (client's Stripe + Ed's worker)
The site is static, so checkout runs through one small Cloudflare Worker that talks to
Stripe with the client's secret key. Cloudflare Workers are free at this traffic level.
1. Client creates a Stripe account at stripe.com (needs their LLC details and bank). They
   add Ed as a team member (Settings → Team) with Developer access, or just share the keys.
2. In Stripe → Product catalog, create each product with one **Price per size**
   (e.g. "Crown of Thorns Tee / M", $60). Copy each price ID (`price_...`) into
   `products.json`:
   ```json
   "variants": { "S": "price_1Abc...", "M": "price_1Abd..." }
   ```
   Set `"soldOut": false` on anything in stock. The page then shows the size picker and
   Add to cart, and the Checkout button creates a Stripe Checkout Session.
3. Deploy the worker: Cloudflare dashboard → Workers & Pages → Create → paste
   `worker/checkout.js` → Deploy. Add the variables listed at the top of that file
   (`STRIPE_SECRET_KEY` as an encrypted secret, `SITE_URL`, `ALLOWED_ORIGINS`).
4. Copy the worker URL into `js/config.js` → `CHECKOUT_ENDPOINT`.
5. Test with Stripe's test keys and card `4242 4242 4242 4242` first, then switch the
   worker's key to the live one.
6. Stripe emails receipts (Settings → Emails → turn on "Successful payments"). Orders show
   up in the Stripe dashboard with the shipping address; the client ships from there.
   Shipping rates live in `worker/checkout.js` (`shipping_options`), tax under Stripe Tax if
   they want it automated.
7. Stripe fees: 2.9% + 30¢ per card payment. No monthly fee.

Shortcut if the worker is too much for day one: create a Stripe **Payment Link** per
product (no code), paste it into `products.json` → `paymentLink`, and the product page
shows a "Buy now" button that opens it. No cart, but live in 10 minutes.

## 4. Restock and drop alerts (Klaviyo, free up to 250 contacts)
1. Create the account, make a list called "Drops".
2. Settings → API keys → copy the **public** key (6 characters) → `KLAVIYO_COMPANY_ID`.
3. Lists & Segments → Drops → copy the list ID from the URL → `KLAVIYO_LIST_ID`.
4. Every "Notify me" button now subscribes the contact with `restock_product` and
   `restock_size` properties, so the client can message just the people waiting for one
   item. SMS needs the compliance text under the form (Klaviyo provides it).
5. Signups collected before Klaviyo was connected sit in the browser's local storage
   (`jl-alerts`) — tiny, but worth exporting from dev tools if there were any.

## 5. Next drop countdown
Set `NEXT_DROP: '2026-11-14T18:00:00-05:00'` and `NEXT_DROP_NAME: 'Winter 01'`. The bar
under the hero counts down, then flips to "Live now" with a Shop button.

## 6. Instagram wall and analytics
- behold.so (free): connect @1justliving1, copy the feed ID → `BEHOLD_FEED_ID`.
- Plausible ($9/mo, no cookie banner) → `PLAUSIBLE_DOMAIN`. Or skip analytics at first.

## 7. Content still marked as placeholder
- Story section copy (`index.html`, section `#story`).
- Product names and prices I guessed: Royal Set, JL Sneaker, Chosen Trucker, all dollar amounts.
- Size chart measurements (`tools/build.py` → `CHARTS`, `info.html`): replace with the spec sheet.
- Shipping and returns terms (`info.html`): confirm rates and windows.
- `CONTACT_EMAIL` in `js/config.js` (set up `hello@` on the new domain, Cloudflare Email
  Routing forwards it for free).
- Cleaner Crown of Thorns photos: replace `assets/products/crown-tee-front.jpg` and `-back.jpg`.

## What the client pays for
| Item | Who | Cost |
|---|---|---|
| Hosting (GitHub Pages + Cloudflare Worker) | Ed, billed as hosting fee | $0 to Ed |
| Domain | Ed buys, bills through | ~$10/yr |
| Stripe | Client | 2.9% + 30¢ per sale |
| Klaviyo | Client | free to 250 contacts |

## Previewing locally
From the `just-living-site` folder:
```
python3 -m http.server 8766 --directory justliving
```
then open http://localhost:8766. The hero background lives in `assets/bg/` (desktop and a
9:16 phone crop); the original render is in `~/Documents/generations/`.
