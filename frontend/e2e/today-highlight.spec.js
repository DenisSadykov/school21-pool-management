const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

// Computed colors are resolved through canvas so color-mix is covered too.
async function contrast(locator, foreground = 'color', background = 'backgroundColor') {
  return locator.evaluate((element, properties) => {
    const style = getComputedStyle(element);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d');
    const luminance = (color) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const rgb = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map((v) => {
        const s = v / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    };
    const a = luminance(style[properties[0]]);
    let backgroundColor = style[properties[1]];
    let ancestor = element.parentElement;
    while (['transparent', 'rgba(0, 0, 0, 0)'].includes(backgroundColor) && ancestor) {
      backgroundColor = getComputedStyle(ancestor).backgroundColor;
      ancestor = ancestor.parentElement;
    }
    const b = luminance(backgroundColor);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }, [foreground, background]);
}

for (const theme of ['light', 'dark']) {
  for (const mobile of [false, true]) {
    test(`today is prominent and exam stays labelled: ${theme}, ${mobile ? 'mobile' : 'desktop'}`, async ({ page }, testInfo) => {
      await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
      await page.addInitScript((value) => localStorage.setItem('uiTheme', value), theme);
      await page.goto('/login');
      await page.getByLabel('Твой ник').fill('admin');
      await page.getByLabel('Пароль', { exact: true }).fill('secret123');
      await page.getByRole('button', { name: 'Войти', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Дашборд' })).toBeVisible();
      const today = await page.evaluate(() => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow' }).format(new Date()));
      await page.route('**/api/schedule', (route) => route.fulfill({ json: {
        pool: { id: 1, name: 'E2E Бассейн', self_signup_enabled: true },
        days: [{ date: today, blocks: [{ id: 9001, date: today, time_start: '10:00', time_end: '14:00',
          label: 'EXAM', capacity: 2, count: 0, volunteers: [] }] }],
      } }));
      await page.goto('/schedule');
      const current = page.locator('[aria-current="date"]');
      await expect(current).toHaveCount(1);
      await expect(current).toContainText('Сегодня');
      await expect(current).toContainText('Экзамен');
      expect(await contrast(current)).toBeGreaterThanOrEqual(4.5);
      expect(await contrast(current.locator('.day-header-badge'))).toBeGreaterThanOrEqual(4.5);
      const card = page.locator('.block-card.today');
      await expect(card).toBeVisible();
      if (mobile) {
        await expect(page.locator('.day-section.today')).toHaveCSS('border-top-width', '2px');
        expect(await contrast(current.locator('.day-fill'))).toBeGreaterThanOrEqual(4.5);
      } else {
        await expect(card).toHaveCSS('border-top-width', '2px');
        expect(await contrast(card, 'borderTopColor')).toBeGreaterThanOrEqual(3);
        await expect(page.locator('.week-cell.today .empty-block')).toHaveCSS('border-top-style', 'solid');
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath('today.png'), fullPage: true });
    });
  }

  test(`script today badge has readable contrast in ${theme}`, async ({ page }) => {
    const styles = ['theme.css', 'TribeScripts.css'].map((file) =>
      fs.readFileSync(path.join(__dirname, '../src/styles', file), 'utf8')).join('\n');
    await page.setContent(`<html data-theme="${theme}"><head><style>${styles}</style></head><body>
      <span class="script-date today">Сегодня · 18.10</span></body></html>`);
    expect(await contrast(page.locator('.script-date.today'))).toBeGreaterThanOrEqual(4.5);
  });
}
