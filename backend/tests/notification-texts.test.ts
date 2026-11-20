import { describe, expect, test } from 'bun:test';
import { NOTIFICATION_KINDS, renderTemplate } from '../src/modules/notifications/catalog';
import { bookingVars, playerLine } from '../src/modules/notifications/booking-vars';

const when = { startsAt: new Date('2026-11-15T13:00:00Z'), endsAt: new Date('2026-11-15T17:00:00Z') };
const svc = { title: 'Игра Warhammer', slug: 'wh_game' };

describe('переменные записи: игра везде (14.11.2026)', () => {
  test('Kill Team: игра, команда с фракцией, без очков', () => {
    const v = bookingVars({ service: svc, details: { kind: 'wh_player', game: 'kt', army: 'Kommandos', points: null, experienceLevel: 'player' }, ...when, tableName: 'Стол 2' });
    expect(v.что).toBe('Kill Team');
    expect(v.игра).toBe('Kill Team');
    expect(v.армия).toStartWith('Команда: Kommandos');
    expect(v.очки).toBe('');
    expect(v.стол).toBe('Стол 2');
  });
  test('запись без игры: заголовок — название услуги', () => {
    const v = bookingVars({ service: { title: 'Посещение клуба', slug: 'visit' }, details: null, ...when });
    expect(v.что).toBe('Посещение клуба');
    expect(v.игра).toBe('');
  });
  test('старая запись без поля game — Warhammer 40,000', () => {
    expect(bookingVars({ service: svc, details: { kind: 'wh_player', army: 'Orks', points: 2000, experienceLevel: 'player' }, ...when }).игра).toBe('Warhammer 40,000');
  });
  test('соперник одной строкой: имя, армия, очки, опыт', () => {
    expect(playerLine({ firstName: 'Иван', username: 'ivan' }, { kind: 'wh_player', game: 'aos', army: 'Seraphon', points: 1000, experienceLevel: 'player' })).toBe('Иван (@ivan) — Seraphon, 1000 очков, Игрок');
  });
});

describe('стандартные тексты', () => {
  test('все переменные шаблона объявлены; на примерах нет неподставленных {…}', () => {
    for (const k of NOTIFICATION_KINDS) {
      const used = [...k.defaultText.matchAll(/\{([^{}\n]+)\}/g)].map((m) => m[1]!);
      for (const name of used) expect(Object.keys(k.vars), `${k.id}: {${name}}`).toContain(name);
      expect(renderTemplate(k.defaultText, k.vars)).not.toMatch(/\{[^{}\n]+\}/);
    }
  });
  test('о записях к игре — игра в заголовке', () => {
    for (const id of ['booking_created', 'opponent_joined', 'opponent_cancelled', 'booking_cancelled_admin', 'booking_time_changed', 'reminder_3h', 'reminder_eve']) {
      const k = NOTIFICATION_KINDS.find((x) => x.id === id)!;
      expect(k.defaultText.split('\n')[0], id).toContain('{что}');
    }
  });
});
