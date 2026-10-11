const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const styles = ['theme.css', 'Students.css'].map(name =>
  fs.readFileSync(path.join(__dirname, '../src/styles', name), 'utf8')
).join('\n');

for (const width of [320, 390, 768, 1280]) {
  test(`student layout fits at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.setContent(`<html><head><style>${styles}</style></head><body>
      <main class="students-page" style="padding:14px">
      <section class="event-copy-filter">
        <div class="event-copy-filter-heading"><h2>Мероприятия пиров</h2><p>Выберите период и скопируйте ники пиров одной колонкой.</p></div>
        <div class="event-copy-filter-controls">
          <label>С даты<input type="date"></label><label>По дату<input type="date"></label>
          <button class="event-copy-button">Скопировать 2 балла (100)</button><button class="event-copy-button">Скопировать 4 балла (100)</button>
        </div>
      </section>
      <table class="students-table"><tbody><tr>
        <td data-label="Пир"><div class="student-person"><button class="nick-button"><strong>student_with_a_very_long_nickname</strong></button></div></td>
        <td data-label="Трайб"><span class="tribe-badge">Общий</span></td>
        <td data-label="Мероприятия"><div class="student-events"><strong>100</strong><div class="student-events-inline"><span class="event-pill">🎉 100</span><span class="event-pill">📚 100</span></div></div></td>
        <td data-label="Статус">Все ок</td><td data-label="Штрафы">—</td>
        <td data-label="Управление"><button style="width:44px;height:44px">…</button></td>
      </tr></tbody></table></main></body></html>`);
    expect(await page.locator('.event-copy-filter').evaluate(e => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
    if (width <= 768) {
      expect(await page.locator('.event-copy-filter').evaluate(e => getComputedStyle(e).display)).toBe('grid');
      for (const cell of await page.locator('.students-table td').all()) {
        expect(await cell.evaluate(e => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
      }
      const menu = await page.locator('td[data-label="Управление"]').boundingBox();
      const details = await page.locator('td[data-label="Трайб"]').boundingBox();
      expect(menu.y + menu.height).toBeLessThanOrEqual(details.y);
    } else {
      expect(await page.locator('.event-copy-filter').evaluate(e => getComputedStyle(e).display)).toBe('flex');
    }
  });
}
