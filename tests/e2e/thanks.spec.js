import { test, expect } from '@playwright/test';

test.describe('/thanks page', () => {
  test('renders the thank-you copy and a back-to-home CTA', async ({ page }) => {
    await page.goto('/thanks');

    // Heading.
    await expect(page.locator('.thanks-title')).toContainText(/THANK\s*YOU/i);

    // Lede mentions the fight.
    await expect(page.locator('.thanks-lede')).toContainText(/lawyer|server|fight/i);

    // Receipt heads-up.
    await expect(page.getByText(/receipt is on its way/i)).toBeVisible();

    // Pillars.
    await expect(page.locator('.thanks-pillars .thanks-pillar')).toHaveCount(3);

    // Back to home.
    const backCta = page.getByRole('link', { name: /BACK TO THE FIGHT/i });
    await expect(backCta).toBeVisible();
    await expect(backCta).toHaveAttribute('href', '/');
  });

  test('is excluded from search engines', async ({ page }) => {
    await page.goto('/thanks');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  });

  test('shares the same nav brand as the home page', async ({ page }) => {
    await page.goto('/thanks');
    await expect(page.locator('.brand-name')).toHaveText('βETAZUCK');
  });
});
