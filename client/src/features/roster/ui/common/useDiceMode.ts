/**
 * Как бросать кубики в играх (решение владельца 07.11.2026): 'app' — бросает приложение, 'manual' — игроки бросают сами
 * и записывают итог. Выбор один на устройство и запоминается. Переключатель — DiceMode.tsx.
 */
import { create } from 'zustand';

export type DiceMode = 'app' | 'manual';
const STORAGE_KEY = 'warphub:dice-mode';

function readMode(): DiceMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'manual' ? 'manual' : 'app';
  } catch {
    return 'app';
  }
}

export const useDiceMode = create<{ mode: DiceMode; setMode: (mode: DiceMode) => void }>((set) => ({
  mode: readMode(),
  setMode: (mode) => {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // нет доступа к хранилищу — выбор действует до перезапуска
    }
    set({ mode });
  },
}));
