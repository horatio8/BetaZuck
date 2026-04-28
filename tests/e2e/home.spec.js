import { test, expect } from '@playwright/test';

test.describe('home page', () => {
  test.beforeEach(async ({ page }) => {
    // Mock the count endpoint so the counter renders without a real backend.
    await page.route('**/api/count', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: 12924 }) }),
    );
  });

  test('renders the hero, nav, and key sections', async ({ page }) => {
    await page.goto('/');

    // Nav.
    await expect(page.locator('.brand-name')).toHaveText('βETAZUCK');

    // Hero.
    await expect(page.locator('.hero-title')).toContainText('Zuck');
    await expect(page.locator('.hero-title-accent')).toContainText('βETA');
    await expect(page.getByRole('link', { name: /SIGN THE PETITION/i })).toBeVisible();

    // Hero image (not the placeholder).
    await expect(page.locator('.hero-photo-img')).toHaveAttribute('src', /hero\.jpg/);

    // Sections by id.
    await expect(page.locator('section.story')).toBeVisible();
    await expect(page.locator('section#petition')).toBeVisible();
    await expect(page.locator('section#donate')).toBeVisible();
  });

  test('counter polls /api/count and renders the number', async ({ page }) => {
    await page.goto('/');

    // Counter is hidden until first successful fetch resolves; once it
    // does, both the hero and petition counters show the formatted number.
    await expect(page.locator('#hero-counter-num')).toHaveText('12,924');
    await expect(page.locator('#petition-counter-num')).toHaveText('12,924');
    await expect(page.locator('#hero-counter')).toBeVisible();
    await expect(page.locator('#petition-counter')).toBeVisible();
  });

  test('counter does not regress when a later poll returns a lower number', async ({ page }) => {
    // Fake the clock so we can fast-forward past the 30s poll interval.
    await page.clock.install();

    let calls = 0;
    await page.route('**/api/count', (route) => {
      calls++;
      // First poll: 13,000. Subsequent polls: 12,000 (an unexpected drop).
      const count = calls === 1 ? 13000 : 12000;
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count }) });
    });

    await page.goto('/');
    await expect(page.locator('#hero-counter-num')).toHaveText('13,000');

    // Advance 35s to trigger the next setInterval poll → returns 12,000.
    await page.clock.runFor(35_000);

    // Counter must NOT drop — the no-regress guard (`if (n > count)`) holds.
    await expect(page.locator('#hero-counter-num')).toHaveText('13,000');
    expect(calls).toBeGreaterThanOrEqual(2);
  });
});
