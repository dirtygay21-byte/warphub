import { useEffect, useState } from 'react';
import { loadRu } from '../../data';
import type { RuOverlay } from '../../ru';

/** Русские тексты фракции 40K (wh-rules.ru); null — ещё загружаются или их нет: показывается английский текст. */
export function useRu(factionId: string | null | undefined): RuOverlay | null {
  const [state, setState] = useState<{ id: string; ru: RuOverlay | null } | null>(null);
  useEffect(() => {
    if (!factionId) return;
    let alive = true;
    void loadRu(factionId).then((ru) => alive && setState({ id: factionId, ru }));
    return () => {
      alive = false;
    };
  }, [factionId]);
  return state && state.id === factionId ? state.ru : null;
}
