/**
 * Компьютер с мышью: колёсико над узкой горизонтальной лентой (даты, вкладки, фильтры, чипы)
 * прокручивает её вбок — иначе без тачпада или Shift до скрытых элементов не добраться.
 * Высокие блоки (таблицы) и вертикальные списки прокручиваются как обычно. На сенсорных экранах не работает.
 */
const STRIP_MAX_HEIGHT = 160;

export function installHorizontalWheel(): void {
  if (typeof window === "undefined" || !window.matchMedia?.("(pointer: fine)").matches) return;
  window.addEventListener(
    "wheel",
    (e) => {
      if (e.ctrlKey || e.shiftKey || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
      let el = e.target instanceof Element ? e.target : null;
      while (el && el !== document.body) {
        if (el instanceof HTMLElement) {
          const st = getComputedStyle(el);
          const canY = (st.overflowY === "auto" || st.overflowY === "scroll") && el.scrollHeight > el.clientHeight + 1;
          if (canY) return;
          const canX = (st.overflowX === "auto" || st.overflowX === "scroll") && el.scrollWidth > el.clientWidth + 1;
          if (canX) {
            if (el.clientHeight > STRIP_MAX_HEIGHT) return;
            const max = el.scrollWidth - el.clientWidth;
            const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
            const next = Math.max(0, Math.min(max, el.scrollLeft + delta));
            if (next !== el.scrollLeft) {
              el.scrollLeft = next;
              e.preventDefault();
            }
            return;
          }
        }
        el = el.parentElement;
      }
    },
    { passive: false },
  );
}
