const { test, expect } = require('@playwright/test');

for (const theme of ['light', 'dark']) {
  for (const width of [320, 390]) {
    test(`penalty studio: ${theme}, ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      await page.addInitScript((value) => localStorage.setItem('uiTheme', value), theme);
      await page.goto('/login');
      await page.getByLabel('Твой ник').fill('admin');
      await page.getByLabel('Пароль', { exact: true }).fill('secret123');
      await page.getByRole('button', { name: 'Войти', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Дашборд' })).toBeVisible();
      const task = { id: 'notice-board', title: 'Порядок на стенде', description: 'Обновить объявления и привести стенд в порядок.' };
      const penalty = { id: 9001, student_name: 'demo_peer', total_hours: 2, completed_hours: 0, workoff_status: 'pending', session: null };
      let commits = 0;
      await page.route('**/api/penalty-miniapp**', (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path.endsWith('/working')) return route.fulfill({ json: { workers: [] } });
        if (path.endsWith('/spin')) return route.fulfill({ json: { task, draft_token: 'synthetic-draft' } });
        if (path.endsWith('/commit')) {
          commits += 1;
          penalty.workoff_status = 'in_workoff';
          penalty.session = { status: 'active', ends_at: new Date(Date.now() + 7200000).toISOString(), current_task: { ...task, task_key: task.id }, tasks: [] };
          return route.fulfill({ json: { penalty, server_now: new Date().toISOString() } });
        }
        if (path.includes('/penalties/')) return route.fulfill({ json: { penalty, server_now: new Date().toISOString() } });
        return route.fulfill({ json: { catalog: [task], penalties: [penalty], server_now: new Date().toISOString() } });
      });
      await page.goto('/miniapp/penalties');
      await page.getByLabel('Кому выдаём').selectOption('9001');
      const commit = page.getByRole('button', { name: 'Зафиксировать пенальти' });
      await expect(commit).toBeDisabled();
      await page.getByRole('button', { name: 'Выбрать', exact: true }).click();
      await expect(commit).toBeEnabled();
      await expect(page.locator('.pm-task-title')).toHaveText(task.title);
      await expect(page.locator('.pm-task-copy')).toHaveText(task.description);
      await expect(page.locator('.pm-header')).not.toContainText(/school\s*21/i);
      expect(commits).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: testInfo.outputPath('preview.png'), fullPage: true });
      await commit.click();
      await expect(page.getByText('Смена задания не обнуляет таймер')).toBeVisible();
      expect(commits).toBe(1);
      await expect(page.getByRole('button', { name: 'Выполнено — следующее' })).toBeEnabled();
      await page.getByRole('link', { name: /Отрабатывают сейчас/ }).click();
      await expect(page.getByRole('heading', { name: 'Отрабатывают сейчас' })).toBeVisible();
    });
  }
}
