import { useEffect, useState } from 'react';
import { loadRu } from '../../data';
import type { RuOverlay } from '../../ru';
import { useRosterLang } from './useRosterLang';

/**
 * Русские тексты фракции 40K (wh-rules.ru); null — ещё загружаются, их нет или выбран английский (переключатель RU/EN):
 * показывается английский текст.
 */
export function useRu(factionId: string | null | undefined): RuOverlay | null {
  const lang = useRosterLang((s) => s.lang);
  const [state, setState] = useState<{ id: string; ru: RuOverlay | null } | null>(null);
  useEffect(() => {
    if (!factionId) return;
    let alive = true;
    void loadRu(factionId).then((ru) => alive && setState({ id: factionId, ru }));
    return () => {
      alive = false;
    };
  }, [factionId]);
  if (lang === 'en') return null;
  return state && state.id === factionId ? state.ru : null;
}
