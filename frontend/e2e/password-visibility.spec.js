const { test, expect } = require('@playwright/test');

for (const width of [1280, 390]) {
  test(`password visibility works with pointer and keyboard at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/login');
    const password = page.getByLabel('Пароль', { exact: true });
    await password.fill('example123');
    await page.getByRole('button', { name: 'Показать пароль: Пароль', exact: true }).click();
    await expect(password).toHaveAttribute('type', 'text');
    await expect(password).toBeFocused();
    await expect(password).toHaveValue('example123');
    await expect(page).toHaveURL(/\/login$/);
    const hide = page.getByRole('button', { name: 'Скрыть пароль: Пароль', exact: true });
    await hide.focus();
    await page.keyboard.press('Space');
    await expect(password).toHaveAttribute('type', 'password');
    await expect(password).toHaveValue('example123');
    await expect(page.getByRole('button', { name: 'Войти', exact: true })).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
