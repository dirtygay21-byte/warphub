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
      left: item.offsetLeft - item.offsetWidth / 2,
      width: item.offsetWidth * 2,
    });
  });

  useEffect(() => {
    const activeItem = document.getElementById(`navigation-item-${activePage}`);
    if (activeItem) {
      updateStyles(activeItem);
    }

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
      className="nav-indicator absolute left-0 top-0 h-[2px] transition-[left,width] duration-300"
      style={indicatorStyle}
    />
  );
}
