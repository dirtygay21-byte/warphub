import clsx from "clsx";
import { useState } from "react";
import EventsList from "./Content/EventsList";
import NewsList from "./Content/NewsList";
import AdminPartners from "./Content/AdminPartners";

const CONTENT_TABS = [
  { id: "events", label: "Список ивентов" },
  { id: "news", label: "Список новостей" },
  { id: "partners", label: "Партнёры" },
] as const;

type ContentTabId = (typeof CONTENT_TABS)[number]["id"];

const TAB_CONTENT: Record<ContentTabId, () => React.ReactNode> = {
  events: EventsList,
  news: NewsList,
  partners: AdminPartners,
};

export default function ContentManagment() {
  const [activeTab, setActiveTab] = useState<ContentTabId>("events");
  const ActiveScreen = TAB_CONTENT[activeTab];

  return (
    <div className="px-4 py-3 pb-8 text-white sm:px-6">
      <div className="mb-4">
        <h1 className="font-display text-[28px] font-bold uppercase leading-none">Управление контентом</h1>
        <p className="mt-1 text-sm text-fg-3">
          Редактирование ивентов, новостей и другого контента клуба
        </p>
      </div>

      <div className="mb-4 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {CONTENT_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              "shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition-colors sm:text-sm",
              activeTab === tab.id
                ? "bg-accent text-accent-foreground"
                : "border border-white/10 bg-white/3 text-white/80 active:bg-white/10",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <ActiveScreen />
    </div>
  );
}
