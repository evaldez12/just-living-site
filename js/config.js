// Just Living — site configuration. Fill these in when the accounts exist.
// Everything works without them (cart stays local, alerts are saved in the browser).
export const CONFIG = {
  // Backend: the Cloudflare Worker in worker/index.js, served from the same origin as the site.
  // Waitlist signups go to /api/subscribe (stored in D1, managed at /admin); checkout goes to
  // /api/checkout (Stripe, once STRIPE_SECRET_KEY is set). On hosts without the Worker (GitHub
  // Pages mirror, previews) these calls fail quietly and the fallbacks below apply.
  WAITLIST_API: '/api/subscribe',
  CHECKOUT_ENDPOINT: '/api/checkout',
  // Where Stripe sends people after paying / cancelling (the live site URL).
  SITE_URL: 'https://justlivingnyc.com',

  // Optional: Klaviyo as a fallback/alternative to the built-in waitlist (leave empty to skip).
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
