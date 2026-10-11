const { test, expect } = require('@playwright/test');

for (const width of [1280, 390]) {
  test(`personal cabinet and preserved settings work at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/login');
    await page.getByLabel('Твой ник').fill('odessabu');
    await page.getByLabel('Пароль', { exact: true }).fill('volunteer123');
    await page.getByRole('button', { name: 'Войти', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Дашборд' })).toBeVisible();
    await page.locator('.navbar-user').click();
    await page.getByRole('button', { name: 'Личный кабинет', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Личный кабинет' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ваш ритм' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'E2E Прошлый бассейн' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Маленькие победы' })).toHaveCount(0);
    await expect(page.getByRole('progressbar')).toHaveCount(0);
    await page.getByLabel('Бассейн', { exact: true }).selectOption({ label: 'E2E Прошлый бассейн' });
    await expect(page.getByRole('heading', { name: 'E2E Бассейн', exact: true })).toHaveCount(0);
    await page.getByText('Из чего складываются коины', { exact: true }).click();
    await expect(page.getByText('Экзамен · 2', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Личные данные', exact: true }).click();
    await expect(page.getByLabel('Имя', { exact: true })).toHaveValue('Денис');
    await expect(page.getByLabel('Ник', { exact: true })).toHaveValue('odessabu');
    await page.getByRole('button', { name: 'Безопасность', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Сменить пароль' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Показать пароль: Новый пароль', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Обзор', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Ваш ритм' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
