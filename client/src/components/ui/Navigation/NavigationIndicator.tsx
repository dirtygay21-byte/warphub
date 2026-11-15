import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { PageTypes } from "@/types";

export default function NavigationIndicator({
  activePage,
}: {
  activePage: PageTypes;
}) {
  const observer = useRef<ResizeObserver | null>(null);
  const [indicatorStyle, setIndicatorStyle] = useState({
    left: 0,
    width: 0,
  });

  const updateStyles = useEffectEvent((item: HTMLElement | null) => {
    if (!item) return;

    setIndicatorStyle({
      // лаймовый концепт: короткая полоска 22 px над подписью выбранного раздела
      left: item.offsetLeft + item.offsetWidth / 2 - 11,
      width: 22,
    });
  });

  useEffect(() => {
    const activeItem = document.getElementById(`navigation-item-${activePage}`);

    // ResizeObserver reports the observed element once right after observe(), so the indicator
    // is positioned on the next frame without a synchronous setState inside the effect.
    observer.current = new ResizeObserver((entries) => {
      entries.forEach(() => {
        updateStyles(activeItem);
      });
    });

    observer.current?.observe(window.document.body);

    return () => {
      observer.current?.disconnect();
    };
  }, [activePage]);

  return (
    <div
      className="nav-indicator absolute left-0 top-2 h-[5px] transition-[left] duration-300"
      style={indicatorStyle}
    />
  );
}
