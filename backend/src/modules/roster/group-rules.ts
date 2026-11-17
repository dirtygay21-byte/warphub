/** Чистые правила событий Telegram для группы Boosty (17.11.2026) — tests/roster-group.test.ts. */
export type ChatMemberLike = { status: string; is_member?: boolean } | null | undefined;
export type Chat = { id: number; type: string; title?: string };
export type TgUser = { id: number; is_bot?: boolean };
export type TelegramUpdate = {
  update_id: number;
  my_chat_member?: { chat: Chat; new_chat_member: { status: string } };
  chat_member?: { chat: Chat; new_chat_member: ChatMemberLike & { user: TgUser }; old_chat_member: ChatMemberLike & { user: TgUser } };
  message?: { chat: Chat; new_chat_members?: TgUser[]; left_chat_member?: TgUser };
};

/** Состоит ли в группе по статусу Telegram (ограниченный участник — по is_member). */
export function isMemberStatus(member: ChatMemberLike): boolean {
  if (!member) return false;
  if (member.status === 'creator' || member.status === 'administrator' || member.status === 'member') return true;
  return member.status === 'restricted' && member.is_member === true;
}

const isGroup = (chat: Chat) => chat.type === 'group' || chat.type === 'supergroup';

/** Что сделать с событием: группа (бот добавлен/изменён) или участник группы (вошёл/вышёл). */
export function classifyUpdate(u: TelegramUpdate):
  | { kind: 'bot'; chat: Chat; status: string }
  | { kind: 'member'; chat: Chat; telegramId: number; isMember: boolean; wasMember: boolean }
  | { kind: 'seen'; chat: Chat }
  | null {
  if (u.my_chat_member && isGroup(u.my_chat_member.chat)) return { kind: 'bot', chat: u.my_chat_member.chat, status: u.my_chat_member.new_chat_member.status };
  if (u.chat_member && isGroup(u.chat_member.chat) && !u.chat_member.new_chat_member.user.is_bot) {
    return {
      kind: 'member',
      chat: u.chat_member.chat,
      telegramId: u.chat_member.new_chat_member.user.id,
      isMember: isMemberStatus(u.chat_member.new_chat_member),
      wasMember: isMemberStatus(u.chat_member.old_chat_member),
    };
  }
  if (u.message && isGroup(u.message.chat)) return { kind: 'seen', chat: u.message.chat };
  return null;
}
