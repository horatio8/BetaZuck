import { test, expect } from '@playwright/test';

test.describe('donate panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/count', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: 12924 }) }),
    );
  });

  test('selecting an amount updates the donate button text', async ({ page }) => {
    await page.goto('/#donate');

    // Default selection is $65.
    await expect(page.locator('#donate-submit')).toContainText('$65');

    await page.locator('button.donate-amt[data-amt="135"]').click();
    await expect(page.locator('#donate-submit')).toContainText('$135');

    await page.locator('button.donate-amt[data-amt="1500"]').click();
    await expect(page.locator('#donate-submit')).toContainText('$1500');
  });

  test('monthly toggle adds "/ MONTH" to the button text', async ({ page }) => {
    await page.goto('/#donate');

    await page.locator('.donate-toggle-btn[data-monthly="true"]').click();
    await expect(page.locator('#donate-submit')).toContainText(/\/ MONTH/);

    await page.locator('.donate-toggle-btn[data-monthly="false"]').click();
    await expect(page.locator('#donate-submit')).not.toContainText(/\/ MONTH/);
  });

  test('custom amount input flips selection and updates the button', async ({ page }) => {
    await page.goto('/#donate');

    await page.locator('#donate-custom-input').fill('250');
    await expect(page.locator('#donate-submit')).toContainText('$250');
  });

  test('clicking DONATE posts to /api/checkout and redirects to the returned url', async ({ page }) => {
    let captured;
    await page.route('**/api/checkout', async (route) => {
      captured = JSON.parse(route.request().postData() || '{}');
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, url: 'https://checkout.stripe.com/c/pay/test_session_abc' }),
      });
    });

    // Stub the redirect target so the page doesn't actually navigate to Stripe.
    await page.route('**/checkout.stripe.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>STRIPE</body></html>' }),
    );

    await page.goto('/#donate');
    await page.locator('button.donate-amt[data-amt="135"]').click();
    await page.locator('.donate-toggle-btn[data-monthly="true"]').click();
    await page.locator('#donate-submit').click();

    // We get redirected to the stubbed Stripe URL.
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 5000 });

    // Verify what was sent.
    expect(captured).toEqual({ amount: 135, monthly: true });
  });

  test('shows the server error in the donate-thanks banner when /api/checkout fails', async ({ page }) => {
    await page.route('**/api/checkout', (route) =>
      route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'Stripe rejected the checkout request' }),
      }),
    );

    await page.goto('/#donate');
    await page.locator('#donate-submit').click();

    await expect(page.locator('#donate-thanks')).toBeVisible();
    await expect(page.locator('#donate-thanks')).toContainText(/Stripe rejected/i);

    // Button is re-enabled for retry.
    await expect(page.locator('#donate-submit')).toBeEnabled();
  });
});
