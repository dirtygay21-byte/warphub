/** Администраторы по Telegram ID (N2): проверка ввода и разделение основных и добавленных администраторов. */
import { afterEach, describe, expect, test } from 'bun:test';
import { getAdminTelegramIds, getBuiltinAdminIds, isAdminUser, isBuiltinAdmin, setAddedAdminIds } from '../src/config/admin';
import { cleanNote, parseTelegramId } from '../src/modules/admins/rules';

afterEach(() => setAddedAdminIds([]));

describe('parseTelegramId', () => {
  test('число или строка из 5–15 цифр; иначе null', () => {
    expect(parseTelegramId('394165661')).toBe(394165661);
    expect(parseTelegramId(' 7012345678 ')).toBe(7012345678);
    expect(parseTelegramId(12345)).toBe(12345);
    for (const bad of ['', '1234', '12ab567', '-394165661', '3.5', '1234567890123456', null, undefined, {}, 0]) expect(parseTelegramId(bad)).toBeNull();
  });
  test('пометка: пробелы обрезаются, до 100 символов, пустая — null', () => {
    expect(cleanNote('  Вася  ')).toBe('Вася');
    expect(cleanNote('x'.repeat(150))!.length).toBe(100);
    expect(cleanNote('   ')).toBeNull();
    expect(cleanNote(5)).toBeNull();
  });
});

describe('основные и добавленные администраторы', () => {
  test('добавленный — администратор, но не основной; основные не меняются', () => {
    const builtin = getBuiltinAdminIds();
    expect(builtin).toContain('394165661');
    setAddedAdminIds([555000111, 'bad', '394165661']);
    expect(getAdminTelegramIds()).toContain('555000111');
    expect(getAdminTelegramIds()).not.toContain('bad');
    expect(getAdminTelegramIds().filter((x) => x === '394165661').length).toBe(1);
    expect(isAdminUser({ telegramId: 555000111 })).toBe(true);
    expect(isBuiltinAdmin({ telegramId: 555000111 })).toBe(false);
    expect(isBuiltinAdmin({ telegramId: 394165661 })).toBe(true);
    expect(getBuiltinAdminIds()).toEqual(builtin);
  });
  test('после удаления из списка доступа нет', () => {
    setAddedAdminIds([555000111]);
    setAddedAdminIds([]);
    expect(isAdminUser({ telegramId: 555000111 })).toBe(false);
  });
});
