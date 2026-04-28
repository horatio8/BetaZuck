import { test, expect } from '@playwright/test';

test.describe('petition form', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/count', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: 12924 }) }),
    );
  });

  test('renders all expected fields with country code defaulting to USA', async ({ page }) => {
    await page.goto('/#petition');

    await expect(page.locator('input[name="first"]')).toBeVisible();
    await expect(page.locator('input[name="last"]')).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="zip"]')).toBeVisible();
    await expect(page.locator('input[name="phone"]')).toBeVisible();

    // Country code dropdown defaults to USA (+1).
    const countrySelect = page.locator('select[name="country_code"]');
    await expect(countrySelect).toHaveValue('+1');

    // The opt-in checkbox should NOT be present anymore.
    await expect(page.locator('input[name="updates"]')).toHaveCount(0);

    // Submit button text.
    await expect(page.locator('button[type="submit"]')).toContainText(/SIGN THE PETITION/);
  });

  test('shows validation error when first name is empty', async ({ page }) => {
    await page.goto('/#petition');

    await page.locator('button[type="submit"]').click();
    await expect(page.locator('#petition-error')).toBeVisible();
    await expect(page.locator('#petition-error')).toContainText(/first name/i);
  });

  test('shows validation error on invalid email', async ({ page }) => {
    await page.goto('/#petition');

    await page.locator('input[name="first"]').fill('Jane');
    await page.locator('input[name="email"]').fill('not-an-email');
    await page.locator('button[type="submit"]').click();

    await expect(page.locator('#petition-error')).toBeVisible();
    await expect(page.locator('#petition-error')).toContainText(/valid email/i);
  });

  test('successful submission shows thank-you panel and prepends country code on phone', async ({ page }) => {
    let captured;
    await page.route('**/api/sign', async (route) => {
      captured = JSON.parse(route.request().postData() || '{}');
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    });

    await page.goto('/#petition');

    await page.locator('input[name="first"]').fill('Jane');
    await page.locator('input[name="last"]').fill('Doe');
    await page.locator('input[name="email"]').fill('jane@example.com');
    await page.locator('input[name="zip"]').fill('90210');
    await page.locator('input[name="phone"]').fill('5551234567');

    await page.locator('button[type="submit"]').click();

    // Thank-you panel reveals.
    await expect(page.locator('#petition-success')).toBeVisible();
    await expect(page.locator('#success-first-name')).toHaveText('Jane');
    await expect(page.locator('#petition-form')).toBeHidden();

    // Verify the request body shape.
    expect(captured).toMatchObject({
      first_name: 'Jane',
      last_name: 'Doe',
      email: 'jane@example.com',
      zip: '90210',
      phone: '+1 5551234567',
    });
  });

  test('after successful submit, page auto-scrolls to #donate within ~2s', async ({ page }) => {
    await page.route('**/api/sign', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }),
    );

    await page.goto('/#petition');
    await page.locator('input[name="first"]').fill('Jane');
    await page.locator('input[name="email"]').fill('jane@example.com');
    await page.locator('button[type="submit"]').click();

    // Wait for the smooth-scroll to land on #donate.
    await expect(page.locator('#donate')).toBeInViewport({ timeout: 5000 });
  });

  test('surfaces server error to the user when /api/sign fails', async ({ page }) => {
    await page.route('**/api/sign', (route) =>
      route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'Nucleus rejected the submission origin.' }),
      }),
    );

    await page.goto('/#petition');
    await page.locator('input[name="first"]').fill('Jane');
    await page.locator('input[name="email"]').fill('jane@example.com');
    await page.locator('button[type="submit"]').click();

    await expect(page.locator('#petition-error')).toBeVisible();
    await expect(page.locator('#petition-error')).toContainText(/Nucleus|origin/i);

    // Form stays visible so the user can retry.
    await expect(page.locator('#petition-form')).toBeVisible();
    await expect(page.locator('#petition-success')).toBeHidden();
  });

  test('country code dropdown changes the prefix prepended to phone', async ({ page }) => {
    let captured;
    await page.route('**/api/sign', async (route) => {
      captured = JSON.parse(route.request().postData() || '{}');
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    });

    await page.goto('/#petition');
    await page.locator('input[name="first"]').fill('Jane');
    await page.locator('input[name="email"]').fill('jane@example.com');
    await page.locator('input[name="phone"]').fill('7700123456');
    // United Kingdom (+44) — multiple options share +1 (US/CA), so pick a unique value.
    await page.locator('select[name="country_code"]').selectOption('+44');
    await page.locator('button[type="submit"]').click();

    await expect(page.locator('#petition-success')).toBeVisible();
    expect(captured.phone).toBe('+44 7700123456');
  });
});
