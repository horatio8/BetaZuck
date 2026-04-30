-- CMS content store + upload bucket.
-- Single jsonb row keyed 'content' holds the entire editable site state.
-- Admin updates the whole tree atomically through PUT /api/content.

create table if not exists public.site_content (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

-- Public read: anon can fetch the current content via this RPC. RLS on
-- the table itself denies direct SELECT, so this is the only public path.
create or replace function public.get_site_content()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(value, '{}'::jsonb)
    from public.site_content
    where key = 'content'
    limit 1;
$$;

revoke all on function public.get_site_content() from public;
grant execute on function public.get_site_content() to anon, authenticated;

alter table public.site_content enable row level security;
-- (no policies → only the service_role key can read or write directly)

-- Storage bucket for admin image uploads (hero, og, etc.).
insert into storage.buckets (id, name, public)
  values ('site-assets', 'site-assets', true)
  on conflict (id) do nothing;

-- Seed the initial content tree mirroring the current static site so
-- nothing visually changes when the CMS ships. Idempotent on re-runs.
insert into public.site_content (key, value) values (
  'content',
  '{
    "site": {
      "title": "βetaZuck — Sign the Petition",
      "description": "Meta silenced 1.3 million voices with no warning. Sign the petition. Fund the fight.",
      "og_title": "Zuck is βETA · Sign the petition.",
      "og_description": "Meta silenced 1.3 million voices with no warning. Sign the petition. Fund the fight.",
      "og_image_url": "https://www.betazuck.com/og.png",
      "twitter_handle": "@angrypatriotx"
    },
    "urgency": {
      "enabled": false,
      "lead": "Before they silence us on Facebook too —"
    },
    "nav": {
      "donate_label": "DONATE",
      "sign_label": "SIGN →"
    },
    "hero": {
      "badge_text": "LIVE CAMPAIGN · APRIL 2026",
      "title_lines": ["Zuck", "is", "βETA"],
      "subtitle_html": "1.3 million voices erased. Meta banned <strong>@WomanPropaganda</strong> with no warning, no appeal, no explanation. This isn''t about one account. This is about <strong>your right to speak.</strong>",
      "cta_primary_label": "SIGN THE PETITION →",
      "cta_secondary_label": "DONATE TO THE FIGHT",
      "image_url": "/hero.jpg",
      "stats": [
        {"n": "1.3M", "l": "Followers erased"},
        {"n": "14,000+", "l": "Malicious reports"},
        {"n": "0", "l": "Warnings or appeals"}
      ],
      "counter_label": "AMERICANS ON THE RECORD · GOAL 10,000"
    },
    "story": {
      "eyebrow": "01 / THE STORY",
      "title": "One account. 1.3 million people. Gone in an afternoon.",
      "items": [
        {"lead": "01 · What happened", "body": "Meta banned @WomanPropaganda with no warning, no appeal, and no explanation. 1.3 million followers — built over years — erased in a single afternoon. 14,000+ coordinated malicious reports. Zero due process."},
        {"lead": "02 · Why it matters",  "body": "If Meta can disappear a community of 1.3 million overnight, they can do it to yours. They can do it to your church, your small business, your family. Centralized speech is a rented room. They''re raising the rent."},
        {"lead": "03 · What we''re doing", "body": "We''re building a war chest to hold Meta accountable — legally, publicly, and politically. We''re rebuilding what they destroyed on platforms that can''t be switched off. We''re making sure the next creator they try to silence has an army behind them."}
      ]
    },
    "petition": {
      "eyebrow": "02 / ADD YOUR NAME",
      "title_line1": "Sign the",
      "title_line2": "petition.",
      "lede": "A roll call of every American who refuses to be silenced by Big Tech. When this number becomes political reality — senators will notice.",
      "counter_label": "signed · target 10,000",
      "submit_label": "SIGN THE PETITION →",
      "success_eyebrow": "✓ SIGNED",
      "success_title_prefix": "Thank you, ",
      "success_body": "Thank you for standing up. No one, especially not Zuck, should have the power to silence free speech."
    },
    "donate": {
      "eyebrow": "03 / FUND THE FIGHT",
      "title_prefix": "",
      "title_accent": "Fund",
      "title_suffix": " the war chest.",
      "lede_html": "Lawyers. Servers. A platform they can''t unplug. Every dollar goes toward holding Big Tech accountable and rebuilding what they destroyed. We are <strong>not</strong> backed by corporations. We are backed by you.",
      "pillars": [
        {"k": "No GoFundMe", "v": "Hostile to our causes"},
        {"k": "No PayPal",   "v": "Deplatforms freely"},
        {"k": "Stripe only", "v": "Can''t ban you for politics"},
        {"k": "100% to fight", "v": "No corporate overhead"}
      ],
      "amounts": [
        {"amt": 35,   "tag": null},
        {"amt": 65,   "tag": null,        "default": true},
        {"amt": 135,  "tag": null},
        {"amt": 265,  "tag": null},
        {"amt": 560,  "tag": "PATRIOT",   "premium": true},
        {"amt": 1500, "tag": "HERO",      "premium": true}
      ],
      "toggle_onetime_label": "ONE-TIME",
      "toggle_monthly_label": "MONTHLY",
      "custom_label": "OTHER AMOUNT $",
      "submit_label_prefix": "DONATE",
      "meta": "Secure checkout via Stripe · 100% goes to the fight · Not tax-deductible"
    },
    "social": {
      "eyebrow": "04 / STAY CONNECTED",
      "title": "Don''t let them cut us off again.",
      "links": [
        {"sym": "f",  "name": "FACEBOOK",   "handle": "/WomanPropaganda",      "role": "THE MAIN STAGE",                  "url": "https://www.facebook.com/share/189kXfSQ7j/"},
        {"sym": "IG", "name": "INSTAGRAM",  "handle": "@womanpropaganda1776",  "role": "NEW ACCOUNT — FOLLOW FIRST",      "url": "https://www.instagram.com/womanpropaganda1776"},
        {"sym": "X",  "name": "X / TWITTER","handle": "@angrypatriotx",        "role": "DAILY UPDATES",                    "url": "https://x.com/angrypatriotx"},
        {"sym": "✉",  "name": "EMAIL LIST", "handle": "via petition",          "role": "THE ONLY CHANNEL THEY CAN''T BAN", "url": "#petition"}
      ]
    },
    "footer": {
      "copyright": "© 2026 βETAZUCK · A PROJECT OF WOMAN PROPAGANDA LLC",
      "links": [
        {"label": "PRIVACY", "url": "#"},
        {"label": "CONTACT", "url": "#"},
        {"label": "PRESS",   "url": "#"}
      ]
    },
    "thanks": {
      "badge": "✓ GIFT RECEIVED",
      "title_line1": "Thank",
      "title_line2": "you.",
      "lede": "You just funded a lawyer''s hour, a server''s month, or a billboard hour. Every dollar goes to the fight — no corporate overhead, no compromises, no platforms that can ban you for politics.",
      "body": "A receipt is on its way to your inbox. If you don''t see it in a few minutes, check your spam folder.",
      "pillars": [
        {"k": "Stripe only",        "v": "Can''t ban you for politics"},
        {"k": "100% to fight",      "v": "No corporate overhead"},
        {"k": "Not tax-deductible", "v": "Direct political action"}
      ],
      "share_body": "The next move? Send three friends to betazuck.com. Three signers and three donors is how a movement compounds — and how we make sure the next creator they try to silence has an army behind them.",
      "cta_label": "BACK TO THE FIGHT →"
    },
    "counter": {
      "baseline": 12924
    }
  }'::jsonb
)
on conflict (key) do nothing;
