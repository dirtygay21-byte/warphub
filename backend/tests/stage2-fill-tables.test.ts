import { describe, expect, test } from 'bun:test';
import { KIND_BY_ID, renderTemplate } from '../src/modules/notifications/catalog';

describe('этап 2: лист ожидания (15.11.2026)', () => {
  test('уведомление «Освободилось место» — личное, не объявление, с игрой и временем', () => {
    const kind = KIND_BY_ID.get('waitlist_free')!;
    expect(kind).toBeDefined();
    expect(kind.announcement).toBe(false);
    const text = renderTemplate(kind.defaultText, kind.vars);
    expect(text).toContain('Освободилось место: Kill Team');
    expect(text).toContain('сб, 15 ноября, 18:00–21:00');
  });
});
