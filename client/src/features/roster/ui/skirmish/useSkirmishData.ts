import { useEffect, useState } from 'react';
import { loadKtGame, loadWarcryGame } from '../../data';
import type { SkirmishGameData, SkirmishSystem } from '../../skirmish/types';

export function usePersistentGameData(system: 'kt'): { data: import('../../skirmish/types').KtGameData | null; error: string | null };
export function usePersistentGameData(system: 'warcry'): { data: import('../../skirmish/types').WarcryGameData | null; error: string | null };
export function usePersistentGameData(system: SkirmishSystem): { data: SkirmishGameData | null; error: string | null } {
  const [data, setData] = useState<SkirmishGameData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    (system === 'kt' ? loadKtGame() : loadWarcryGame()).then(
      (value) => { if (active) setData(value); },
      (e) => { if (active) setError(String(e?.message ?? e)); },
    );
    return () => { active = false; };
  }, [system]);
  return { data, error };
}
