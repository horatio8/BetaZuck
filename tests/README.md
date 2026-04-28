# E2E tests

Playwright suite. Mocks `/api/*` so it runs locally without real Stripe / Supabase / Nucleus credentials.

## First-time setup

```bash
npm install
npm run test:install   # downloads Chromium + WebKit (~600 MB, one-time)
```

## Run

```bash
npm test               # all suites, both browsers
npm run test:headed    # see the browser
npm run test:ui        # interactive Playwright UI for debugging
npm run test:report    # open last run's HTML report
```

The default config spins up a static server on port 3000 (`npx serve`) and runs tests against it.

## Run against a deployed environment

```bash
BASE_URL=https://www.betazuck.com npm test
```

This skips the local server and tests the live site. Use this for the API smoke tests (`api-smoke.spec.js`), which are skipped without `BASE_URL`.

To also hit real Stripe (test mode) from the smoke tests:

```bash
BASE_URL=https://www.betazuck.com RUN_STRIPE_SMOKE=1 npx playwright test api-smoke
```

Requires `STRIPE_SECRET_KEY` to be a `sk_test_...` (or `rk_test_...` with `Checkout Sessions: write`) in the deployed env.

## What's covered

| Suite | What it asserts |
| --- | --- |
| `home.spec.js` | Hero renders, key sections present, counter polls `/api/count` and renders the number, no regression on lower API response. |
| `petition.spec.js` | All form fields render incl. country code dropdown defaulting to USA, validation errors for missing first name / bad email, success path reveals thank-you panel and prepends country code on phone, auto-scroll to `#donate` after 2s, server error surfaces in `#petition-error`. |
| `donate.spec.js` | Amount selection updates button text, monthly toggle adds "/ MONTH", custom amount works, clicking DONATE posts to `/api/checkout` and redirects to the returned URL, server error renders in `#donate-thanks`. |
| `thanks.spec.js` | `/thanks` renders the heading, lede, pillars, back-to-home CTA, and is `noindex`'d. |
| `api-smoke.spec.js` | Read-only smoke against deployed `/api/count`, `/api/checkout` validation, `/api/sign` method check, `/api/stripe-webhook` signature check. |

## What's NOT covered

- **Real Nucleus/Supabase writes** — would require dedicated test accounts. The smoke suite deliberately avoids `POST /api/sign` because it has side effects.
- **Visual regression** — no Percy / Chromatic integration. Add later if needed.
- **Accessibility** — no axe-core integration. Add `@axe-core/playwright` if/when a11y becomes a priority.
