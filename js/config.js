// Just Living — site configuration. Fill these in when the accounts exist.
// Everything works without them (cart stays local, alerts are saved in the browser).
export const CONFIG = {
  // Stripe checkout. The site is static (GitHub Pages), so the cart posts to a tiny
  // Cloudflare Worker (worker/checkout.js) that creates a Stripe Checkout Session with the
  // client's secret key and sends the buyer to Stripe. Example:
  // 'https://jl-checkout.<account>.workers.dev'
  CHECKOUT_ENDPOINT: '',
  // Where Stripe sends people after paying / cancelling (the live site URL).
  SITE_URL: 'https://justlivingnyc.com',

  // Klaviyo: public API key ("company id", 6 characters) and the list to subscribe to.
  // Found under Settings > API keys and Lists & Segments in Klaviyo.
  KLAVIYO_COMPANY_ID: '',
  KLAVIYO_LIST_ID: '',

  // Next drop. ISO date with timezone, e.g. '2026-11-14T18:00:00-05:00'. Empty = "date TBA".
  NEXT_DROP: '',
  NEXT_DROP_NAME: '',

  // Instagram wall. Create a feed at behold.so, paste its feed ID here.
  BEHOLD_FEED_ID: '',

  // Analytics. Plausible site domain, e.g. 'justlivingnyc.com'. Empty = no analytics.
  PLAUSIBLE_DOMAIN: '',

  // Optional campaign video for the story section (mp4 path under assets/). Empty = none.
  STORY_VIDEO: '',

  INSTAGRAM_URL: 'https://instagram.com/1justliving1',
  CONTACT_EMAIL: 'hello@justlivingnyc.com',
};
