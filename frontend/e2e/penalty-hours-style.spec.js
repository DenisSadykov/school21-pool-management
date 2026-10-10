const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const styles = ['theme.css', 'Penalties.css'].map((name) =>
  fs.readFileSync(path.join(__dirname, '../src/styles', name), 'utf8')
).join('\n');

for (const theme of ['light', 'dark']) {
  test(`penalty hours show one compact arrow in ${theme} theme`, async ({ page }) => {
    await page.setContent(`<html data-theme="${theme}"><head><style>${styles}</style></head>
      <body><select aria-label="Hours" class="penalty-hours penalty-hours-select">
      <option value="2">2h</option><option value="4">4h (×2)</option></select></body></html>`);
    const select = page.getByLabel('Hours');
    for (const state of ['normal', 'hover', 'focus']) {
      if (state === 'hover') await select.hover();
      if (state === 'focus') await select.focus();
      const style = await select.evaluate((element) => {
        const computed = getComputedStyle(element);
        return {
          repeat: computed.backgroundRepeat,
          size: computed.backgroundSize,
          image: computed.backgroundImage,
          rightPadding: computed.paddingRight,
          appearance: computed.appearance,
        };
      });
      expect(style.repeat).toBe('no-repeat');
      expect(style.size).toBe('14px 14px');
      expect(style.image).toContain('data:image/svg+xml');
      expect(style.rightPadding).toBe('28px');
      expect(style.appearance).toBe('none');
    }
    await select.selectOption('4');
    await expect(select).toHaveValue('4');
  });
}
