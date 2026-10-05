import { useState } from "react";

/** Текущее время, зафиксированное при первом рендере компонента */
export function useNow(): number {
  const [now] = useState(() => Date.now());
  return now;
}
