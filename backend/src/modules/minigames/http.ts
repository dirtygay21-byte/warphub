import { status } from 'elysia';
import { MinigameError } from './service';

export function mapMinigameError(error: MinigameError) {
  switch (error.code) {
    case 'GAME_NOT_FOUND':
    case 'SESSION_NOT_FOUND':
    case 'REWARD_NOT_FOUND':
      return status(404, { error: error.message, code: error.code });
    case 'SESSION_FINISHED':
    case 'REWARD_USED':
      return status(409, { error: error.message, code: error.code });
    case 'DAILY_LIMIT':
      return status(429, { error: error.message, code: error.code });
    case 'GAME_DISABLED':
    case 'SESSION_EXPIRED':
    case 'REWARD_EXPIRED':
    case 'WRONG_GAME':
    case 'INVALID_SCORE':
    case 'INVALID_SETTINGS':
      return status(400, { error: error.message, code: error.code });
    default: {
      const _exhaustive: never = error.code;
      return status(500, { error: 'Unexpected mini-game error' });
    }
  }
}

/** Общая обёртка: MinigameError → понятный HTTP-ответ */
export async function handleMinigame<T>(fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof MinigameError) return mapMinigameError(error);
    console.error('[minigames]', error);
    return status(500, { error: 'Mini-game error' });
  }
}
