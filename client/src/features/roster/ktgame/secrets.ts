import type { KtState, Op, Seat } from './index';

export type KtSecret = { tacOp: string; primaryOp: Op | null };
const key = (code: string, seat: Seat) => `warphub.kt.secret.v1.${code}.${seat}`;

export function readKtSecret(code: string, seat: Seat): KtSecret | null {
  try {
    const value = JSON.parse(localStorage.getItem(key(code, seat)) ?? 'null') as Partial<KtSecret> | null;
    if (!value || typeof value.tacOp !== 'string') return null;
    return { tacOp: value.tacOp, primaryOp: value.primaryOp === 'crit' || value.primaryOp === 'kill' || value.primaryOp === 'tac' ? value.primaryOp : null };
  } catch {
    return null;
  }
}

export function writeKtSecret(code: string, seat: Seat, secret: KtSecret): void {
  try {
    localStorage.setItem(key(code, seat), JSON.stringify(secret));
  } catch {
    /* офлайн-память устройства недоступна */
  }
}

export function injectKtSecret(state: KtState, code: string, seat: Seat): KtState {
  const secret = readKtSecret(code, seat);
  if (!secret) return state;
  const next = structuredClone(state);
  next.players[seat].tacOp = secret.tacOp;
  next.players[seat].primaryOp = secret.primaryOp;
  return next;
}

export function redactKtSetup(event: Extract<import('./index').KtEventBody, { type: 'setup' }>, placeholderTacOp: string): Extract<import('./index').KtEventBody, { type: 'setup' }> {
  return {
    ...event,
    rosters: {
      p1: { ...event.rosters.p1, tacOp: placeholderTacOp },
      p2: { ...event.rosters.p2, tacOp: placeholderTacOp },
    },
  };
}
