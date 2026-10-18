const { test, expect } = require('@playwright/test');
const fs = require('fs');

// Optional local visual fixture, never packaged or uploaded to production by tests.
const image = process.env.ACHIEVEMENT_PREVIEW_IMAGE ? fs.readFileSync(process.env.ACHIEVEMENT_PREVIEW_IMAGE)
  : Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const title = 'альфаультрамегасигмагероиня (тест)';

for (const theme of ['light', 'dark']) {
  for (const width of [1280, 390]) {
    test(`manual achievement collection: ${theme}, ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('uiTheme', value), theme);
      await page.goto('/login');
      await page.getByLabel('Твой ник').fill('admin');
      await page.getByLabel('Пароль', { exact: true }).fill('secret123');
      const loginResponse = page.waitForResponse((response) => response.url().endsWith('/api/auth/login'));
      await page.getByRole('button', { name: 'Войти', exact: true }).click();
      const response = await loginResponse;
      const apiBase = new URL(response.url()).origin;
      const headers = { Authorization: `Bearer ${(await response.json()).token}` };
      await expect(page.getByRole('heading', { name: 'Дашборд' })).toBeVisible();
      const users = await (await page.request.get(`${apiBase}/api/users`, { headers })).json();
      const recipient = users.find((user) => user.nick === 'odessabu');
      const created = await page.request.post(`${apiBase}/api/admin/achievements`, { headers, multipart: {
        key: 'e2e-manual-achievement', title, file: { name: 'award.png', mimeType: 'image/png', buffer: image },
      } });
      expect([200, 201]).toContain(created.status());
      const item = await created.json();
      const grant = await page.request.post(`${apiBase}/api/admin/achievements/${item.id}/awards`, {
        headers, data: { user_id: recipient.id },
      });
      expect([200, 201]).toContain(grant.status());
      expect((await grant.json()).notification_status).toBe('not_requested');
      await page.locator('.navbar-user').click();
      await page.getByRole('button', { name: 'Выйти', exact: true }).click();
      await page.goto('/profile?tab=achievements');
      await page.getByLabel('Твой ник').fill('odessabu');
      await page.getByLabel('Пароль', { exact: true }).fill('volunteer123');
      await page.getByRole('button', { name: 'Войти', exact: true }).click();
      await expect(page).toHaveURL(/\/profile\?tab=achievements$/);
      await expect(page.getByRole('button', { name: 'Ачивки', exact: true })).toHaveAttribute('aria-current', 'page');
      const open = page.getByRole('button', { name: `Открыть ачивку «${title}»` });
      await expect(open).toBeVisible();
      await expect(open.getByRole('img')).toBeVisible();
      await expect(open.getByRole('img')).toHaveCSS('object-fit', 'contain');
      await expect(page.getByRole('progressbar')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`collection-${theme}-${width}.png`), fullPage: true });
      await open.click();
      const dialog = page.getByRole('dialog', { name: title });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('img')).toBeVisible();
      await expect(dialog.getByRole('img')).toHaveCSS('object-fit', 'contain');
      await expect(page.getByRole('button', { name: 'Закрыть изображение' })).toBeFocused();
      await page.screenshot({ path: testInfo.outputPath(`viewer-${theme}-${width}.png`), fullPage: false });
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(open).toBeFocused();
      await page.reload();
      await expect(open).toBeVisible();
    });
  }
}
