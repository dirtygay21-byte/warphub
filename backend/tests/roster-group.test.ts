// WarpBuilder для подписчиков Boosty (17.11.2026): статусы участника и события бота.
import { describe, expect, test } from 'bun:test';
import { classifyUpdate, isMemberStatus } from '../src/modules/roster/group-rules';

const chat = { id: -100123, type: 'supergroup', title: 'WBG Boosty' };
const user = { id: 42 };

describe('статус участника', () => {
  test('в группе: создатель, админ, участник, ограниченный участник', () => {
    for (const status of ['creator', 'administrator', 'member']) expect(isMemberStatus({ status })).toBe(true);
    expect(isMemberStatus({ status: 'restricted', is_member: true })).toBe(true);
  });
  test('не в группе: вышел, удалён, ограниченный не участник, нет данных', () => {
    expect(isMemberStatus({ status: 'left' })).toBe(false);
    expect(isMemberStatus({ status: 'kicked' })).toBe(false);
    expect(isMemberStatus({ status: 'restricted', is_member: false })).toBe(false);
    expect(isMemberStatus(null)).toBe(false);
  });
});

describe('события бота', () => {
  test('вступил и удалён', () => {
    const join = classifyUpdate({ update_id: 1, chat_member: { chat, old_chat_member: { status: 'left', user }, new_chat_member: { status: 'member', user } } });
    expect(join).toEqual({ kind: 'member', chat, telegramId: 42, isMember: true, wasMember: false });
    const kick = classifyUpdate({ update_id: 2, chat_member: { chat, old_chat_member: { status: 'member', user }, new_chat_member: { status: 'kicked', user } } });
    expect(kick).toMatchObject({ isMember: false, wasMember: true });
  });
  test('бота добавили админом; сообщение в группе — группа видна; боты и личка — пропуск', () => {
    expect(classifyUpdate({ update_id: 3, my_chat_member: { chat, new_chat_member: { status: 'administrator' } } })).toEqual({ kind: 'bot', chat, status: 'administrator' });
    expect(classifyUpdate({ update_id: 4, message: { chat } })).toEqual({ kind: 'seen', chat });
    expect(classifyUpdate({ update_id: 5, message: { chat: { id: 42, type: 'private' } } })).toBeNull();
    const bot = { id: 7, is_bot: true };
    expect(classifyUpdate({ update_id: 6, chat_member: { chat, old_chat_member: { status: 'left', user: bot }, new_chat_member: { status: 'member', user: bot } } })).toBeNull();
  });
});
