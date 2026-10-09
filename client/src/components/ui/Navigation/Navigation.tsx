import { useLocation } from "react-router-dom";
import NavigationItem from "./NavigationItem";
import NavigationIndicator from "./NavigationIndicator";
import { getActivePageFromPath, useNavItems } from "./useNavItems";

/** Нижняя панель разделов — телефон и узкое окно (на широком экране её заменяет боковая панель). */
export default function Navigation() {
  const { pathname } = useLocation();
  const items = useNavItems();
  const activePage = getActivePageFromPath(pathname);

  return (
    <div className="w-full overflow-hidden border-t border-white/5 bg-[rgb(var(--color-nav-bg)/0.72)] backdrop-blur-xl backdrop-saturate-150">
      <div className="relative mx-auto flex w-full items-center justify-around !py-3 md:max-w-2xl">
        <NavigationIndicator activePage={activePage} />

        {items.map((item) => (
          <NavigationItem
            key={item.page}
            id={`navigation-item-${item.page}`}
            icon={item.icon}
            title={item.title}
            isActive={item.isActive}
            onClick={item.onClick}
          />
        ))}
      </div>
    </div>
  );
}
