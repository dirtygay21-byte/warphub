import { useState } from 'react';

const LS_SPELLS = 'warphub.roster.aos.spellsOpen';
function readOpen(): boolean {
  try {
    return localStorage.getItem(LS_SPELLS) !== '0';
  } catch {
    return true;
  }
}

/** Свёрнутость блока «Заклинания и молитвы» запоминается на устройстве; кнопка и содержимое всегда согласованы. */
export function useSpellsOpen(): [boolean, () => void] {
  const [open, setOpen] = useState(readOpen);
  const toggle = () => {
    const next = !open;
    try {
      localStorage.setItem(LS_SPELLS, next ? '1' : '0');
    } catch {
      /* без хранилища — просто в памяти */
    }
    setOpen(next);
  };
  return [open, toggle];
}
