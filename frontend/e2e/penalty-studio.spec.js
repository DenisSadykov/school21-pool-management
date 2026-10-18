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
      const task = { id: 'notice-board', title: 'Собрать подборку из 20 полезных горячих клавиш для разработчиков', description: 'Собрать подборку из 20 полезных горячих клавиш для разработчиков и оформить памятку.' };
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
      const pupilSelect = page.getByLabel('Кому выдаём');
      await pupilSelect.waitFor({ state: 'visible' });
      await page.keyboard.press('Tab');
      await expect(pupilSelect).toBeFocused();
      await expect(pupilSelect).toHaveCSS('outline-style', 'none');
      await expect(page.locator('.pm-select-wrap')).toHaveCSS('outline-style', 'solid');
      await expect(page.locator('.pm-select-wrap')).toHaveCSS('outline-width', '2px');
      await expect(page.locator('.pm-select-wrap')).toHaveCSS('border-radius', '30px');
      await pupilSelect.selectOption('9001');
      const commit = page.getByRole('button', { name: 'Зафиксировать пенальти' });
      await expect(commit).toBeDisabled();
      await page.getByRole('button', { name: 'Выбрать', exact: true }).click();
      await expect(commit).toBeEnabled();
      await expect(page.locator('.pm-task-title')).toHaveText(task.title);
      await expect(page.locator('.pm-task-copy')).toHaveText(task.description);
      const titleSize = await page.locator('.pm-task-title').evaluate(el => parseFloat(getComputedStyle(el).fontSize));
      expect(titleSize).toBeGreaterThanOrEqual(24);
      expect(titleSize).toBeLessThanOrEqual(28);
      await expect(page.locator('.pm-task-title')).toHaveCSS('font-weight', '800');
      await expect(page.locator('.pm-bottom-nav')).toHaveCSS('border-top-left-radius', '32px');
      await expect(page.locator('.pm-bottom-nav a').first()).toHaveCSS('border-top-left-radius', '27px');
      const dock = await page.locator('.pm-bottom-nav').boundingBox();
      expect(dock.x).toBeGreaterThan(0);
      expect(dock.width).toBeLessThan(width);
      await expect(page.locator('.pm-header')).not.toContainText(/school\s*21/i);
      await expect(commit).toHaveCSS('background-color', 'rgb(25, 91, 234)');
      const centered = async (button) => {
        const box = await button.boundingBox();
        const label = await button.locator('.pm-button-label').boundingBox();
        expect(Math.abs((box.x + box.width / 2) - (label.x + label.width / 2))).toBeLessThan(1);
        expect(Math.abs((box.y + box.height / 2) - (label.y + label.height / 2))).toBeLessThan(1);
      };
      await centered(commit);
      expect(commits).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: testInfo.outputPath('preview.png'), fullPage: true });
      await commit.click();
      await expect(page.getByText('Смена задания не обнуляет таймер')).toBeVisible();
      expect(commits).toBe(1);
      await expect(page.getByRole('button', { name: 'Выполнено — следующее' })).toBeEnabled();
      await centered(page.getByRole('button', { name: 'Выполнено — следующее' }));
      await page.getByRole('link', { name: /Отрабатывают сейчас/ }).click();
      await expect(page.getByRole('heading', { name: 'Отрабатывают сейчас' })).toBeVisible();
    });
  }
}
