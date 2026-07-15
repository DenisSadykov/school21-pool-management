const { test, expect } = require('@playwright/test');

test.describe('School 21 Pool smoke', () => {
  test('admin can log in and open settings', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'School 21 Pool' })).toBeVisible();
    await page.getByLabel('Роль', { exact: true }).selectOption('admin');
    await page.getByLabel('Твой ник').fill('admin');
    await page.getByLabel('Пароль').fill('secret123');
    await page.getByRole('button', { name: 'Войти' }).click();

    await expect(page.getByRole('heading', { name: 'Дашборд' })).toBeVisible();
    await expect(page.getByText('E2E заметка для проверки дашборда')).toBeVisible();
    await expect(page.getByText('Ответственные за бассейн')).toBeVisible();

    await page.getByRole('link', { name: 'Настройки бассейна' }).click();
    await expect(page).toHaveURL(/\/manage$/);
    await expect(page.getByRole('heading', { name: 'Настройки бассейна' })).toBeVisible();
    await expect(page.getByText('Ответственные за бассейн')).toBeVisible();

    const notificationSwitch = page.getByRole('switch', { name: 'Уведомления для @admin' });
    await expect(notificationSwitch).toHaveAttribute('aria-checked', 'true');
    await notificationSwitch.click();
    await expect(notificationSwitch).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByText('Уведомления выключены')).toBeVisible();
    await notificationSwitch.click();
    await expect(notificationSwitch).toHaveAttribute('aria-checked', 'true');
  });

  test('admin can open notifications hub', async ({ page }) => {
    await page.goto('/');

    await page.getByLabel('Роль').selectOption('admin');
    await page.getByLabel('Твой ник').fill('admin');
    await page.getByLabel('Пароль').fill('secret123');
    await page.getByRole('button', { name: 'Войти' }).click();

    await expect(page.getByRole('heading', { name: 'Дашборд' })).toBeVisible();
    await page.getByRole('link', { name: 'Уведомления' }).click();
    await expect(page).toHaveURL(/\/notifications$/);
    await expect(page.getByRole('heading', { name: 'Уведомления' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Рассылки' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Доска объявлений' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Telegram' })).toBeVisible();

    await page.getByRole('button', { name: 'Доска объявлений' }).click();
    await expect(page.getByRole('checkbox', {
      name: 'Уведомить в Telegram о новом объявлении',
    })).toBeVisible();
  });

  test('volunteer can log in and sees only volunteer screens', async ({ page }) => {
    await page.goto('/');

    await page.getByLabel('Роль', { exact: true }).selectOption('volunteer');
    await page.getByLabel('Твой ник').fill('odessabu');
    await page.getByRole('button', { name: 'Войти' }).click();

    await expect(page.getByRole('heading', { name: 'Дашборд' })).toBeVisible();
    await expect(page.getByText('E2E заметка для проверки дашборда')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Настройки бассейна' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'График смен' })).toBeVisible();
  });

  test('staff can switch the schedule to read-only for volunteers', async ({ page }) => {
    await page.goto('/');

    await page.getByLabel('Роль').selectOption('admin');
    await page.getByLabel('Твой ник').fill('admin');
    await page.getByLabel('Пароль').fill('secret123');
    await page.getByRole('button', { name: 'Войти' }).click();
    await page.getByRole('link', { name: 'График смен' }).click();

    const signupEnabledButton = page.getByRole('button', { name: 'Запись включена' });
    const signupDisabledButton = page.getByRole('button', { name: 'Запись выключена' });
    await expect(signupEnabledButton.or(signupDisabledButton)).toBeVisible();
    if (await signupDisabledButton.isVisible()) {
      await signupDisabledButton.click();
      await expect(signupEnabledButton).toBeVisible();
    }
    await signupEnabledButton.click();
    await expect(page.getByRole('button', { name: 'Запись выключена' })).toBeVisible();

    await page.getByRole('button', { name: 'AD @admin Админ' }).click();
    await page.getByRole('button', { name: 'Выйти' }).click();
    await page.getByLabel('Роль', { exact: true }).selectOption('volunteer');
    await page.getByLabel('Твой ник').fill('odessabu');
    await page.getByRole('button', { name: 'Войти' }).click();
    await page.getByRole('link', { name: 'График смен' }).click();

    await expect(page.getByRole('status')).toContainText('График доступен только для просмотра');
    await expect(page.getByRole('button', { name: 'Запись выключена' })).toBeDisabled();
  });
});
