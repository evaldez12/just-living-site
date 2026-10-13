# Just Living — launch checklist

Plan: Ed hosts the site on GitHub Pages and bills a hosting fee, the client opens a Stripe
account for payments, Ed buys and connects the domain. Everything in the site already works
without accounts (cart stays in the browser, restock alerts are saved locally); these are
the steps that connect it to the real world. Each one is a single value in `js/config.js`
or `products.json`.

## 1. Hosting (Ed) — Cloudflare Workers, deployed from GitHub
Done on 2026-10-13. The repo https://github.com/evaldez12/just-living-site is connected to a
Cloudflare Worker named `just-living-site` (Workers & Pages in the Cloudflare dashboard).
Every push to `main` rebuilds and deploys. Live at:
https://just-living-site.edwardovaldez0512.workers.dev

`wrangler.jsonc` tells Cloudflare to serve the repo as static files; `.assetsignore` keeps the
tooling out of the upload. GitHub Pages (https://evaldez12.github.io/just-living-site/) still
works as a mirror until the domain is connected; turn it off then (repo Settings → Pages).
Wrangler (Cloudflare's CLI) is installed and logged in on this Mac: `wrangler deployments list --name just-living-site`.
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
1. Buy the domain through Cloudflare Registrar (Domains → Register) so DNS is already here.
2. Cloudflare dashboard → Workers & Pages → just-living-site → Settings → Domains & Routes →
   Add → Custom domain → enter the domain (and again for `www`). Cloudflare creates the DNS
   records and the certificate itself; nothing to copy.
3. Update `SITE_URL` in `js/config.js` and the og:image URL in `index.html` to the full
   `https://` address (social previews need absolute URLs).

## 3. Payments (client's Stripe)
Checkout runs through the site's own Cloudflare Worker (`worker/index.js`, route `/api/checkout`).
1. Client creates a Stripe account at stripe.com (needs their LLC details and bank) and adds Ed
   as a team member with Developer access, or shares the keys.
2. In Stripe → Product catalog, create each product with one **Price per size**
   (e.g. "Crown of Thorns Tee / M", $60). Copy each price ID (`price_...`) into `products.json`:
   ```json
   "variants": { "S": "price_1Abc...", "M": "price_1Abd..." }
   ```
   Set `"soldOut": false` on anything in stock. The page then shows the size picker and
   Add to cart, and Checkout creates a Stripe Checkout Session.
3. Add the secret key to the Worker (from the `justliving` folder):
   ```
   wrangler secret put STRIPE_SECRET_KEY
   ```
   Test with Stripe's test key and card `4242 4242 4242 4242` first, then put in the live key.
4. Stripe emails receipts (Settings → Emails → "Successful payments"). Orders appear in the
   Stripe dashboard with the shipping address. Shipping rates are in `worker/index.js`
   (`shipping_options`); Stripe Tax if they want tax automated. Fees: 2.9% + 30¢ per card payment.

Shortcut if Stripe products are too much for day one: create a Stripe **Payment Link** per
product (no code), paste it into `products.json` → `paymentLink`, and the product page shows a
"Buy now" button. No cart, but live in 10 minutes.

## 4. Restock and drop alerts (built in — Cloudflare D1 + the admin page)
Live since 2026-10-13. Every "Notify me" button and the Restock Alerts form post to
`/api/subscribe`, which stores the contact, product and size in the D1 database `jl-waitlist`.
- **Admin page:** `<site>/admin`. Needs the admin key, which is in
  `~/Documents/just-living-site/ADMIN-KEY.txt` on Ed's Mac (not in the repo). Shows who is
  waiting per product and size, exports CSV, removes contacts, and sends emails.
  To rotate the key: `wrangler secret put ADMIN_KEY` with a new value, then update the file.
- **Email sending (Resend, free to 3,000/month):** create an account at resend.com, add the
  brand's domain under Domains and put the two DNS records it gives you into Cloudflare DNS
  (same account, Domains → the domain → DNS). Then:
  ```
  wrangler secret put RESEND_API_KEY
  ```
  and set `MAIL_FROM` in `wrangler.jsonc` to e.g. `Just Living <drops@justlivingnyc.com>`,
  redeploy. Until the domain is verified, Resend only delivers to the account owner's own
  address, which is enough to test with the "Send test" button.
- Every email carries a one-click unsubscribe link (`/api/unsubscribe`), required by law.
- **Texts:** phone numbers are collected but not messaged from the admin page. Export the CSV
  and use Klaviyo, Postscript or Twilio for SMS; US marketing texts need carrier registration
  (10DLC) first.
- Klaviyo can still be used alongside: fill `KLAVIYO_*` in `js/config.js` and signups go to
  both.
- `SITE_URL` in `wrangler.jsonc` must be the real domain once it exists (it is used in
  unsubscribe links and Stripe return URLs).

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
- Product photos on the site are the ivory cut-outs in `assets/products/ivory/` (made by `tools/ivory.py`
  from the originals in `assets/products/`). The Pirate Tee could not be cut out (white tee on white),
  so it is tinted instead: ask the designer for the artwork on a transparent PNG and re-run the script.
- Cleaner Crown of Thorns photos: replace `assets/products/crown-tee-front.jpg` and `-back.jpg`, then re-run `docpython tools/ivory.py`.

## What the client pays for
| Item | Who | Cost |
|---|---|---|
| Hosting (GitHub Pages + Cloudflare Worker) | Ed, billed as hosting fee | $0 to Ed |
| Domain | Ed buys, bills through | ~$10/yr |
| Stripe | Client | 2.9% + 30¢ per sale |
| Waitlist + admin (Cloudflare D1, Resend email) | Ed, billed as hosting fee | $0 |

## Previewing locally
From the `just-living-site` folder:
```
python3 -m http.server 8766 --directory justliving
```
then open http://localhost:8766. The hero background lives in `assets/bg/` (desktop and a
9:16 phone crop); the original render is in `~/Documents/generations/`.
