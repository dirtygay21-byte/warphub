import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { loadGlossary } from '../../data';
import { findAbility, findKeyword, parseRich, termHit, type Glossary, type GlossaryHit } from '../../glossary';
import { haptic, pushOverlay } from '../../telegram';
import { cleanRuleText } from '../../text';
import { IconButton } from '../kit';
import { cx } from '../util';

/**
 * Всплывающая подсказка правила (01.11.2026, по образцу wh-rules.ru): нажатие на способность оружия, основную способность,
 * ключевое слово или правило открывает небольшую карточку под ним — название, номер раздела основных правил, текст.
 * Термины в тексте подчёркнуты: нажатие открывает термин в той же карточке («‹» — назад). Закрытие — ✕, нажатие мимо,
 * «Назад» Telegram или Escape. Одновременно открыта одна подсказка.
 *
 * Что показать: lookup — поиск в глоссарии 40K (glossary.json, текст wh-rules.ru), или text — готовый текст правила
 * (правила фракции, детачмента, Kill Team, Warcry…).
 */
export type RuleSource =
  | { lookup: 'ability' | 'keyword'; label: string }
  | { title: string; text: string; sub?: string };

type Shown = { kind: 'hit'; hit: GlossaryHit } | { kind: 'missing'; label: string } | { kind: 'text'; title: string; text: string; sub?: string };

let closeOpen: (() => void) | null = null;

export function RuleTrigger({ source, className, children, title }: { source: RuleSource; className?: string; children: ReactNode; title?: string }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const close = useCallback(() => setAnchor(null), []);
  return (
    <>
      <button
        type="button"
        title={title}
        onClick={(e) => {
          e.stopPropagation();
          if (anchor) return close();
          closeOpen?.();
          setAnchor(e.currentTarget.getBoundingClientRect());
          haptic.select();
        }}
        className={cx('cursor-pointer', anchor && 'ring-1 ring-accent/60', className)}
      >
        {children}
      </button>
      {anchor && <RulePopover anchor={anchor} source={source} onClose={close} />}
    </>
  );
}

function resolve(g: Glossary, source: { lookup: 'ability' | 'keyword'; label: string }): Shown {
  const hit = source.lookup === 'ability' ? findAbility(g, source.label) : findKeyword(g, source.label);
  return hit ? { kind: 'hit', hit } : { kind: 'missing', label: source.label };
}

function RulePopover({ anchor, source, onClose }: { anchor: DOMRect; source: RuleSource; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [g, setG] = useState<Glossary | null>(null);
  const [failed, setFailed] = useState(false);
  // стек термина: нажатие на термин в тексте открывает его в той же карточке
  const [stack, setStack] = useState<string[]>([]);

  // готовый текст (правила фракции и т. п.) глоссарий не ждёт
  const needsGlossary = !('text' in source);
  useEffect(() => {
    let alive = true;
    if (needsGlossary)
      loadGlossary().then(
        (d) => alive && setG(d),
        () => alive && setFailed(true),
      );
    return () => {
      alive = false;
    };
  }, [needsGlossary]);

  useEffect(() => {
    closeOpen = onClose;
    const pop = pushOverlay(onClose);
    const onDown = (e: PointerEvent) => !box.current?.contains(e.target as Node) && onClose();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    // карточка привязана к месту на экране: при прокрутке страницы закрывается (внутри карточки — нет)
    const onScroll = (e: Event) => !box.current?.contains(e.target as Node) && onClose();
    const t = window.setTimeout(() => document.addEventListener('pointerdown', onDown), 0);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onClose);
    return () => {
      if (closeOpen === onClose) closeOpen = null;
      pop();
      window.clearTimeout(t);
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  const top = stack.at(-1);
  const termShown = (gl: Glossary, id: string): Shown => {
    const hit = termHit(gl, id);
    return hit ? { kind: 'hit', hit } : { kind: 'missing', label: id };
  };
  const shown: Shown | null = 'text' in source ? { kind: 'text', title: source.title, text: source.text, sub: source.sub } : !g ? null : top ? termShown(g, top) : resolve(g, source);

  // под нажатым элементом; если снизу мало места — над ним
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(360, vw - 24);
  const left = Math.max(12, Math.min(anchor.left, vw - width - 12));
  const below = vh - anchor.bottom > 220 || anchor.top < vh / 2;
  const style = below ? { top: anchor.bottom + 6, left, width, maxHeight: Math.max(160, vh - anchor.bottom - 18) } : { bottom: vh - anchor.top + 6, left, width, maxHeight: Math.max(160, anchor.top - 18) };

  const openTerm = (id: string) => {
    setStack((s) => [...s, id]);
    haptic.select();
  };

  return createPortal(
    <div ref={box} role="dialog" aria-modal={false} style={style} className="fade-enter fixed z-[60] flex flex-col overflow-hidden rounded-xl border border-accent/30 bg-app-elevated shadow-2xl shadow-black/60">
      <div className="flex items-center gap-2 border-b border-white/[0.08] px-3 py-1.5">
        {stack.length > 0 && <IconButton icon="back" label="Назад" onClick={() => setStack((s) => s.slice(0, -1))} className="size-7" />}
        <p className="min-w-0 flex-1 truncate">{shown ? <Head shown={shown} /> : <span className="text-[13px] text-fg-3">Загрузка…</span>}</p>
        {shown?.kind === 'hit' && shown.hit.kind === 'ability' && shown.hit.ability.num && <span className="shrink-0 text-[12px] text-fg-3">{shown.hit.ability.num}</span>}
        <IconButton icon="close" label="Закрыть" onClick={onClose} className="size-7" />
      </div>
      <div className="overflow-y-auto overscroll-contain px-3 py-2.5 text-[13px] leading-relaxed text-fg-2">
        {failed ? <p className="text-fg-3">Не удалось загрузить правила — проверьте связь.</p> : shown ? <Body shown={shown} g={g} onTerm={openTerm} /> : null}
      </div>
    </div>,
    document.body,
  );
}

function Head({ shown }: { shown: Shown }) {
  if (shown.kind === 'text') return <span className="text-[13px] font-semibold">{shown.title}</span>;
  if (shown.kind === 'missing') return <span className="text-[13px] font-semibold uppercase">{shown.label}</span>;
  const h = shown.hit;
  if (h.kind === 'term') return <span className="text-[13px] font-semibold">{h.term}</span>;
  const name = h.kind === 'ability' ? h.ability.name : `[${h.key}]`;
  return name.startsWith('[') ? <span className="rounded border border-accent/50 px-1 py-px text-[12px] font-semibold text-accent">{name}</span> : <span className="text-[13px] font-semibold">{name}</span>;
}

function Body({ shown, g, onTerm }: { shown: Shown; g: Glossary | null; onTerm: (id: string) => void }) {
  if (shown.kind === 'text')
    return (
      <>
        {shown.sub && <p className="mb-1 text-[12px] text-fg-3">{shown.sub}</p>}
        <p className="whitespace-pre-line">{cleanRuleText(shown.text) || 'Нет данных.'}</p>
      </>
    );
  if (shown.kind === 'missing') return <p className="text-fg-3">Нет данных: этого правила нет в глоссарии (wh-rules.ru, версия {g?.source.dataVersion ?? '—'}).</p>;
  const h = shown.hit;
  const texts = h.kind === 'ability' ? [h.ability.text] : h.kind === 'weapon' ? h.texts : [h.text];
  return (
    <div className="space-y-2">
      {texts.map((t, i) => (
        <Rich key={i} text={t} g={g} onTerm={onTerm} />
      ))}
      {h.kind === 'ability' && h.ability.example && (
        <div className="rounded-lg bg-white/[0.04] px-2.5 py-2 text-[12px]">
          <span className="font-semibold text-fg-3">Пример. </span>
          <Rich text={h.ability.example} g={g} onTerm={onTerm} inline />
        </div>
      )}
      <p className="text-[11px] text-fg-3">Источник: wh-rules.ru · версия данных {g?.source.dataVersion}</p>
    </div>
  );
}

/** Текст с разметкой wh-rules: **жирный**, [gloss:id:термин] — нажимается (если термин есть в глоссарии). */
function Rich({ text, g, onTerm, inline }: { text: string; g: Glossary | null; onTerm: (id: string) => void; inline?: boolean }) {
  const Tag = inline ? 'span' : 'p';
  return (
    <Tag className="whitespace-pre-line">
      {parseRich(text).map((p, i) =>
        p.t === 'text' ? (
          p.s
        ) : p.t === 'bold' ? (
          <b key={i} className="font-semibold text-fg">
            {p.s}
          </b>
        ) : g?.terms[p.id] ? (
          <button key={i} type="button" onClick={() => onTerm(p.id)} className="font-semibold text-fg underline decoration-accent/60 decoration-dotted underline-offset-2 active:text-accent">
            {p.s}
          </button>
        ) : (
          <b key={i} className="font-semibold text-fg">
            {p.s}
          </b>
        ),
      )}
    </Tag>
  );
}


/** Способность оружия как на wh-rules.ru: [BLAST 1] в рамке; нажатие — подсказка. */
export function WeaponAbilityTag({ label }: { label: string }) {
  return (
    <RuleTrigger
      source={{ lookup: 'ability', label }}
      className="-my-0.5 inline-flex min-h-6 items-center rounded border border-accent/40 bg-accent/[0.06] px-1.5 text-[11px] font-semibold uppercase leading-none tracking-wide text-accent/90 active:bg-accent/20"
    >
      [{label}]
    </RuleTrigger>
  );
}
