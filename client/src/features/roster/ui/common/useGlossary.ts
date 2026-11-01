import { useEffect, useState } from 'react';
import { loadGlossary } from '../../data';
import type { Glossary } from '../../glossary';

/** Глоссарий правил 40K для разметки (какие ключевые слова нажимаются); null — ещё загружается или нет связи. */
export function useGlossary(): Glossary | null {
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
  return g;
}
