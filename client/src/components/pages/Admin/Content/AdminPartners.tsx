import { createPartnerCard, deletePartnerCard, fetchPartnerMetadata, getAdminPartners, updatePartnerCard, updatePartnerSettings, type PartnerCard, type PartnerCardInput, type PartnerLane, type PartnerSettings } from "@/apiUtils/partners";
import { inputClassName } from "@/components/booking/FormControls";
import { haptic } from "@/utils/haptic";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowDown, ArrowUp, Edit2, Eye, EyeOff, LoaderCircle, Plus, RefreshCw, Save, Trash2, X } from "lucide-react";
import { useState } from "react";

export default function AdminPartners() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["admin-partners"], queryFn: getAdminPartners });
  const [editor, setEditor] = useState<{ mode: "create" | "edit"; lane: PartnerLane; card?: PartnerCard } | null>(null);
  const settings = query.data?.settings ?? { partner1Title: "Партнёр 1", partner2Title: "Партнёр 2", footerText: "Мини-ки по скидке", updatedAt: null };
  const remove = useMutation({
    meta: { success: "Карточка удалена" },
    mutationFn: (id: number) => deletePartnerCard(id),
    onSuccess: () => {
      haptic.ok();
      queryClient.invalidateQueries({ queryKey: ["admin-partners"] });
      queryClient.invalidateQueries({ queryKey: ["partners"] });
    },
  });
  const toggle = useMutation({
    meta: { success: "Карточка обновлена" },
    mutationFn: (card: PartnerCard) => updatePartnerCard(card.id, { isActive: !card.isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-partners"] });
      queryClient.invalidateQueries({ queryKey: ["partners"] });
    },
  });
  const move = useMutation({
    mutationFn: async ({ card, direction }: { card: PartnerCard; direction: -1 | 1 }) => {
      const cards = (query.data?.cards ?? []).filter((item) => item.lane === card.lane);
      const index = cards.findIndex((item) => item.id === card.id);
      const next = [...cards];
      const target = index + direction;
      if (index < 0 || target < 0 || target >= next.length) return;
      [next[index], next[target]] = [next[target], next[index]];
      await Promise.all(next.map((item, sortOrder) => item.sortOrder === sortOrder ? Promise.resolve() : updatePartnerCard(item.id, { sortOrder })));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-partners"] }),
  });
  const closeEditor = () => setEditor(null);
  const saved = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-partners"] });
    queryClient.invalidateQueries({ queryKey: ["partners"] });
    closeEditor();
  };
  return (
    <div className="space-y-5 text-fg">
      <PartnerSettingsForm key={settings.updatedAt ?? "default"} settings={settings} />

      {editor && <CardEditor key={`${editor.mode}-${editor.card?.id ?? editor.lane}`} mode={editor.mode} lane={editor.lane} card={editor.card} onClose={closeEditor} onSaved={saved} />}

      {query.isLoading ? <div className="flex justify-center py-8"><LoaderCircle className="size-7 animate-spin text-accent" /></div> : query.isError ? (
        <div className="rounded-2xl border border-white/10 bg-app-elevated p-4 text-center"><p className="text-sm text-fg-2">Не удалось загрузить карточки.</p><button type="button" onClick={() => query.refetch()} className="ds-press mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground"><RefreshCw className="size-4" />Повторить</button></div>
      ) : (
        ([1, 2] as PartnerLane[]).map((lane) => {
          const cards = (query.data?.cards ?? []).filter((card) => card.lane === lane);
          const title = lane === 1 ? query.data?.settings.partner1Title : query.data?.settings.partner2Title;
          return (
            <section key={lane}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="min-w-0 flex-1 truncate text-lg font-semibold">{title}</h2>
                <button type="button" onClick={() => setEditor({ mode: "create", lane })} className="ds-press inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-accent/40 bg-accent/10 px-3 text-sm font-semibold text-accent"><Plus className="size-4" />Добавить</button>
              </div>
              {cards.length === 0 ? <p className="rounded-2xl border border-dashed border-white/15 px-4 py-5 text-center text-sm text-fg-3">Карточек пока нет</p> : (
                <div className="space-y-2">
                  {cards.map((card, index) => (
                    <article key={card.id} className={clsx("rounded-2xl border border-white/10 bg-app-elevated p-3", !card.isActive && "opacity-60")}>
                      <div className="flex gap-3">
                        {card.imageUrl ? <img src={card.imageUrl} alt="" className="size-16 shrink-0 rounded-xl object-cover" /> : <div className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-white/[0.05] text-xs text-fg-3">Нет фото</div>}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{card.title}</p>
                          {card.text && <p className="mt-0.5 line-clamp-2 text-[13px] text-fg-2">{card.text}</p>}
                          <p className="mt-1 truncate text-[12px] text-fg-3">{card.url}</p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <IconButton label="Редактировать" onClick={() => setEditor({ mode: "edit", lane, card })}><Edit2 className="size-4" /></IconButton>
                        <IconButton label={card.isActive ? "Скрыть" : "Показать"} onClick={() => toggle.mutate(card)}>{card.isActive ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</IconButton>
                        <IconButton label="Выше" disabled={index === 0 || move.isPending} onClick={() => move.mutate({ card, direction: -1 })}><ArrowUp className="size-4" /></IconButton>
                        <IconButton label="Ниже" disabled={index === cards.length - 1 || move.isPending} onClick={() => move.mutate({ card, direction: 1 })}><ArrowDown className="size-4" /></IconButton>
                        <IconButton label="Удалить" danger onClick={() => { if (window.confirm(`Удалить «${card.title}»?`)) remove.mutate(card.id); }}><Trash2 className="size-4" /></IconButton>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          );
        })
      )}
      {(remove.isError || toggle.isError || move.isError) && <p className="text-sm text-danger">{remove.error?.message ?? toggle.error?.message ?? move.error?.message}</p>}
    </div>
  );
}

function PartnerSettingsForm({ settings }: { settings: PartnerSettings }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(settings);
  const save = useMutation({
    meta: { success: "Настройки партнёров сохранены" },
    mutationFn: () => updatePartnerSettings(value),
    onSuccess: () => {
      haptic.ok();
      queryClient.invalidateQueries({ queryKey: ["admin-partners"] });
      queryClient.invalidateQueries({ queryKey: ["partners"] });
    },
  });
  return (
    <section className="rounded-2xl border border-white/10 bg-app-elevated p-4">
      <h2 className="text-lg font-semibold">Настройки блока</h2>
      <p className="mt-1 text-sm text-fg-2">Заголовок «Миниатюры наших партнёров» фиксирован. Здесь меняются названия лент и нижний текст.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">Партнёр 1<input value={value.partner1Title} onChange={(event) => setValue((current) => ({ ...current, partner1Title: event.target.value }))} className={inputClassName} maxLength={120} /></label>
        <label className="text-sm font-medium">Партнёр 2<input value={value.partner2Title} onChange={(event) => setValue((current) => ({ ...current, partner2Title: event.target.value }))} className={inputClassName} maxLength={120} /></label>
      </div>
      <label className="mt-3 block text-sm font-medium">Нижний текст<textarea value={value.footerText} onChange={(event) => setValue((current) => ({ ...current, footerText: event.target.value }))} className={clsx(inputClassName, "min-h-20 resize-y")} maxLength={600} /></label>
      <button type="button" disabled={save.isPending || !value.partner1Title.trim() || !value.partner2Title.trim()} onClick={() => save.mutate()} className="ds-press mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground disabled:opacity-50"><Save className="size-4" />{save.isPending ? "Сохраняем…" : "Сохранить настройки"}</button>
      {save.isError && <p className="mt-2 text-sm text-danger">{save.error.message}</p>}
    </section>
  );
}

function IconButton({ children, label, onClick, disabled, danger }: { children: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className={clsx("ds-press flex size-9 items-center justify-center rounded-lg border border-white/10 text-fg-2 active:bg-white/[0.06] disabled:opacity-40", danger && "text-danger")}>{children}</button>;
}

function CardEditor({ mode, lane, card, onClose, onSaved }: { mode: "create" | "edit"; lane: PartnerLane; card?: PartnerCard; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ title: card?.title ?? "", text: card?.text ?? "", url: card?.url ?? "", imageUrl: card?.imageUrl ?? "", lane, sortOrder: card?.sortOrder as number | undefined, isActive: card?.isActive ?? true });
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((current) => ({ ...current, [key]: value }));
  const save = useMutation({
    meta: { success: "Карточка сохранена" },
    mutationFn: (input: PartnerCardInput) => mode === "edit" && card ? updatePartnerCard(card.id, input) : createPartnerCard(input),
    onSuccess: () => { haptic.ok(); onSaved(); },
  });
  const metadata = useMutation({
    mutationFn: () => fetchPartnerMetadata(form.url),
    onSuccess: (result) => {
      setForm((current) => ({ ...current, title: result.title || current.title, text: result.text || current.text, imageUrl: result.imageUrl || current.imageUrl, url: result.url }));
      setMetadataError(null);
    },
    onError: (error) => setMetadataError(error.message),
  });
  const submit = () => save.mutate({ lane: form.lane, title: form.title, text: form.text, url: form.url, imageUrl: form.imageUrl, sortOrder: form.sortOrder, isActive: form.isActive });
  return (
    <section className="rounded-2xl border border-accent/30 bg-accent/[0.06] p-4">
      <div className="flex items-start justify-between gap-3">
        <div><h2 className="text-lg font-semibold">{mode === "edit" ? "Редактирование карточки" : "Новая карточка"}</h2><p className="mt-1 text-sm text-fg-2">Сначала можно заполнить данные по ссылке, затем проверить и изменить их вручную.</p></div>
        <button type="button" aria-label="Закрыть" onClick={onClose} className="ds-press flex size-9 items-center justify-center rounded-lg text-fg-3 active:bg-white/[0.06]"><X className="size-5" /></button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium sm:col-span-2">Ссылка на миниатюру<input value={form.url} onChange={(event) => set("url", event.target.value)} className={inputClassName} placeholder="https://…" inputMode="url" /></label>
        <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
          <button type="button" disabled={!form.url.trim() || metadata.isPending} onClick={() => metadata.mutate()} className="ds-press inline-flex min-h-10 items-center gap-2 rounded-xl border border-accent/40 bg-accent/10 px-3 text-sm font-semibold text-accent disabled:opacity-50"><RefreshCw className={clsx("size-4", metadata.isPending && "animate-spin")} />{metadata.isPending ? "Загружаем…" : "Заполнить по ссылке"}</button>
          {metadataError && <p className="text-sm text-danger">{metadataError}</p>}
        </div>
        <label className="text-sm font-medium">Лента<select value={form.lane} onChange={(event) => set("lane", Number(event.target.value) as PartnerLane)} className={inputClassName}><option value={1}>Партнёр 1</option><option value={2}>Партнёр 2</option></select></label>
        <label className="text-sm font-medium">Порядок<input type="number" min={0} value={form.sortOrder ?? ""} onChange={(event) => set("sortOrder", event.target.value === "" ? undefined : Number(event.target.value))} className={inputClassName} placeholder="Автоматически" /></label>
        <label className="text-sm font-medium sm:col-span-2">Заголовок<input value={form.title} onChange={(event) => set("title", event.target.value)} className={inputClassName} maxLength={180} /></label>
        <label className="text-sm font-medium sm:col-span-2">Текст<textarea value={form.text} onChange={(event) => set("text", event.target.value)} className={clsx(inputClassName, "min-h-20 resize-y")} maxLength={600} /></label>
        <label className="text-sm font-medium sm:col-span-2">Изображение<input value={form.imageUrl} onChange={(event) => set("imageUrl", event.target.value)} className={inputClassName} placeholder="https://…" inputMode="url" /></label>
        <label className="flex min-h-11 items-center gap-2 text-sm font-medium"><input type="checkbox" checked={form.isActive} onChange={(event) => set("isActive", event.target.checked)} className="size-4 accent-current" />Показывать в Profile</label>
      </div>
      <div className="mt-4 flex gap-2">
        <button type="button" disabled={save.isPending || !form.title.trim() || !form.url.trim()} onClick={submit} className="ds-press inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground disabled:opacity-50"><Save className="size-4" />{save.isPending ? "Сохраняем…" : "Сохранить"}</button>
        <button type="button" onClick={onClose} className="ds-press min-h-11 rounded-xl border border-white/10 px-4 text-sm font-semibold">Отмена</button>
      </div>
      {save.isError && <p className="mt-2 text-sm text-danger">{save.error.message}</p>}
    </section>
  );
}
