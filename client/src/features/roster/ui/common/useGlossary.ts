import { useEffect, useMemo, useState } from 'react';
import { loadGlossary } from '../../data';
import { localizeGlossary, type Glossary } from '../../glossary';
import { useRosterLang } from './useRosterLang';

/** Глоссарий правил 40K на выбранном языке (RU/EN) для разметки и подсказок; null — ещё загружается или нет связи. */
export function useGlossary(): Glossary | null {
  const lang = useRosterLang((s) => s.lang);
  const [g, setG] = useState<Glossary | null>(null);
  useEffect(() => {
    let alive = true;
    loadGlossary().then(
      (d) => alive && setG(d),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, []);
  return useMemo(() => (g ? localizeGlossary(g, lang) : null), [g, lang]);
}
