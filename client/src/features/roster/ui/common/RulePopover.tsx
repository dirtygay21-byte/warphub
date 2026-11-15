import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { loadGlossary } from '../../data';
import { findAbility, findKeyword, localizeGlossary, parseRich, termHit, type Glossary, type GlossaryHit } from '../../glossary';
import { haptic, pushOverlay } from '../../telegram';
import { cleanRuleText } from '../../text';
import { IconButton } from '../kit';
import { cx } from '../util';
import { useEn, useT } from './i18n';

/**
 * Всплывающая подсказка правила (01.11.2026, по образцу wh-rules.ru): нажатие на способность оружия, основную способность,
 * ключевое слово или правило открывает небольшую карточку под ним — название, номер раздела основных правил, текст.
 * Термины в тексте подчёркнуты: нажатие открывает термин в той же карточке («‹» — назад). Закрытие — ✕, нажатие мимо,
 * «Назад» Telegram или Escape. Одновременно открыта одна подсказка.
 *
 * Что показать: lookup — поиск в глоссарии 40K (glossary.json, текст wh-rules.ru): способность, ключевое слово или термин по id;
 * или text — готовый текст правила (правила фракции, детачмента, Kill Team, Warcry…); rich — текст с разметкой wh-rules.ru
 * (русские тексты 40K: термины и основные способности в нём нажимаются).
 */
export type RuleLookup = { lookup: 'ability' | 'keyword'; label: string } | { lookup: 'term'; id: string; label: string };
export type RuleSource = RuleLookup | { title: string; text: string; sub?: string; rich?: boolean };

type Shown = { kind: 'hit'; hit: GlossaryHit } | { kind: 'missing'; label: string } | { kind: 'text'; title: string; text: string; sub?: string; rich?: boolean };

let closeOpen: (() => void) | null = null;

export function RuleTrigger({ source, className, children, title }: { source: RuleSource; className?: string; children: ReactNode; title?: string }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const close = useCallback(() => setAnchor(null), []);
  return (
    <>
      <button
        type="button"
        title={title}
        data-rule-trigger=""
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

function resolve(g: Glossary, source: RuleLookup): Shown {
  const hit = source.lookup === 'term' ? termHit(g, source.id) : source.lookup === 'ability' ? findAbility(g, source.label) : findKeyword(g, source.label);
  return hit ? { kind: 'hit', hit } : { kind: 'missing', label: source.label };
}

function RulePopover({ anchor, source, onClose }: { anchor: DOMRect; source: RuleSource; onClose: () => void }) {
  const tt = useT();
  const en = useEn();
  const box = useRef<HTMLDivElement>(null);
  const [raw, setG] = useState<Glossary | null>(null);
  // 16.11.2026: подсказка — на языке экрана (раньше всегда по-русски, и в режиме EN тексты смешивались)
  const g = raw ? localizeGlossary(raw, en ? 'en' : 'ru') : null;
  const [failed, setFailed] = useState(false);
  // стек: нажатие на термин или способность в тексте открывает их в той же карточке
  const [stack, setStack] = useState<RuleLookup[]>([]);

  // готовый текст без разметки (правила фракции по-английски и т. п.) глоссарий не ждёт
  const needsGlossary = !('text' in source) || !!source.rich;
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
    // нажатие мимо карточки только закрывает её (07.11.2026): следующий click не доходит до того, что под пальцем
    // (иначе в редакторе KT/Warcry выбирался или снимался вариант снаряжения). Другая подсказка открывается сразу.
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element;
      if (box.current?.contains(t)) return;
      onClose();
      if (t.closest?.('[data-rule-trigger]')) return;
      const swallow = (c: MouseEvent) => {
        c.stopPropagation();
        c.preventDefault();
      };
      document.addEventListener('click', swallow, { capture: true, once: true });
      window.setTimeout(() => document.removeEventListener('click', swallow, { capture: true }), 500);
    };
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
  const shown: Shown | null = top ? (g ? resolve(g, top) : null) : 'text' in source ? { kind: 'text', title: source.title, text: source.text, sub: source.sub, rich: source.rich } : !g ? null : resolve(g, source);

  // под нажатым элементом; если снизу мало места — над ним
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(360, vw - 24);
  const left = Math.max(12, Math.min(anchor.left, vw - width - 12));
  const below = vh - anchor.bottom > 220 || anchor.top < vh / 2;
  const style = below ? { top: anchor.bottom + 6, left, width, maxHeight: Math.max(160, vh - anchor.bottom - 18) } : { bottom: vh - anchor.top + 6, left, width, maxHeight: Math.max(160, anchor.top - 18) };

  const openLink = (l: RuleLookup) => {
    setStack((s) => [...s, l]);
    haptic.select();
  };
  // ссылка внутри карточки открывает правило в ней же
  const link: LinkRender = (l, label, key) => (
    <button key={key} type="button" onClick={() => openLink(l)} className="font-semibold text-fg underline decoration-accent/60 decoration-dotted underline-offset-2 active:text-accent">
      {label}
    </button>
  );

  return createPortal(
    // карточка в портале, но события React всплывают по дереву компонентов — до строки, где стоит подсказка
    // (строка оружия KT — выбор снаряжения). Нажатия внутри карточки дальше не идут.
    <div
      ref={box}
      role="dialog"
      aria-modal={false}
      style={style}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      className="fade-enter fixed z-[60] flex flex-col overflow-hidden rounded-xl border border-accent/30 bg-app-elevated shadow-2xl shadow-black/60">
      <div className="flex items-center gap-2 border-b border-white/[0.08] px-3 py-1.5">
        {stack.length > 0 && <IconButton icon="back" label={tt('Назад', 'Back')} onClick={() => setStack((s) => s.slice(0, -1))} className="size-7" />}
        <p className="min-w-0 flex-1 truncate">{shown ? <Head shown={shown} /> : <span className="text-[13px] text-fg-3">{tt('Загрузка…', 'Loading…')}</span>}</p>
        {shown?.kind === 'hit' && shown.hit.kind === 'ability' && shown.hit.ability.num && <span className="shrink-0 text-[12px] text-fg-3">{shown.hit.ability.num}</span>}
        <IconButton icon="close" label={tt('Закрыть', 'Close')} onClick={onClose} className="size-7" />
      </div>
      <div className="overflow-y-auto overscroll-contain px-3 py-2.5 text-[13px] leading-relaxed text-fg-2">
        {failed ? <p className="text-fg-3">{tt('Не удалось загрузить правила — проверьте связь.', 'Could not load the rules — check your connection.')}</p> : shown ? <Body shown={shown} g={g} link={link} /> : null}
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

function Body({ shown, g, link }: { shown: Shown; g: Glossary | null; link: LinkRender }) {
  const tt = useT();
  if (shown.kind === 'text')
    return (
      <>
        {shown.sub && <p className="mb-1 text-[12px] text-fg-3">{shown.sub}</p>}
        {shown.rich ? <Rich text={shown.text} g={g} link={link} /> : <p className="whitespace-pre-line">{cleanRuleText(shown.text) || tt('Нет данных.', 'No data.')}</p>}
      </>
    );
  if (shown.kind === 'missing') return <p className="text-fg-3">{tt(`Нет данных: этого правила нет в глоссарии (wh-rules.ru, версия ${g?.source.dataVersion ?? '—'}).`, `No data: this rule is not in the glossary (wh-rules.ru, version ${g?.source.dataVersion ?? '—'}).`)}</p>;
  const h = shown.hit;
  const texts = h.kind === 'ability' ? [h.ability.text] : h.kind === 'weapon' ? h.texts : [h.text];
  return (
    <div className="space-y-2">
      {texts.map((t, i) => (
        <Rich key={i} text={t} g={g} link={link} />
      ))}
      {h.kind === 'ability' && h.ability.example && (
        <div className="rounded-lg bg-white/[0.04] px-2.5 py-2 text-[12px]">
          <span className="font-semibold text-fg-3">{tt('Пример. ', 'Example. ')}</span>
          <Rich text={h.ability.example} g={g} link={link} inline />
        </div>
      )}
      <p className="text-[11px] text-fg-3">{tt('Источник: wh-rules.ru · версия данных', 'Source: wh-rules.ru · data version')} {g?.source.dataVersion}</p>
    </div>
  );
}

type LinkRender = (l: RuleLookup, label: string, key: number) => ReactNode;

/** Заголовок раздела «### Da Boss | Босс» → «Босс (Da Boss)», как названия в приложении. */
const heading = (h: string) => {
  const [en, ru] = h.split(/\s*\|\s*/);
  return ru ? `${ru} (${en})` : en!;
};

/**
 * Текст с разметкой wh-rules: **жирный**, __выделение__, [gloss:id:термин] и [core:Deep Strike] — нажимаются
 * (если термин есть в глоссарии), «### заголовок» — строкой-заголовком. link — как показать ссылку.
 */
function Rich({ text, g, link, inline }: { text: string; g: Glossary | null; link: LinkRender; inline?: boolean }) {
  const Tag = inline ? 'span' : 'p';
  let n = 0;
  const chunk = (t: string) =>
    parseRich(t).map((p) => {
      const key = n++;
      if (p.t === 'text') return p.s;
      if (p.t === 'bold')
        return (
          <b key={key} className="font-semibold text-fg">
            {p.s}
          </b>
        );
      if (p.t === 'em')
        return (
          <u key={key} className="decoration-fg-3 underline-offset-2">
            {p.s}
          </u>
        );
      if (p.t === 'core') return link({ lookup: 'ability', label: p.s }, p.s, key);
      return g?.terms[p.id] ? (
        link({ lookup: 'term', id: p.id, label: p.s }, p.s, key)
      ) : (
        <b key={key} className="font-semibold text-fg">
          {p.s}
        </b>
      );
    });
  // «### заголовок» — отдельной строкой
  const parts = text.split(/(?:^|\n)### ([^\n]+)\n?/);
  return (
    <Tag className="whitespace-pre-line">
      {parts.map((t, i) =>
        i % 2 ? (
          <span key={`h${i}`} className="mt-2 block font-semibold text-fg">
            {heading(t)}
          </span>
        ) : (
          chunk(t)
        ),
      )}
    </Tag>
  );
}

/**
 * Русский текст правила с разметкой wh-rules.ru вне карточки (способности инфолиста, правила детачмента…): термины и основные
 * способности подчёркнуты и открывают подсказку. Глоссарий — для проверки, какие термины нажимаются (useGlossary).
 */
export function RuleRichText({ text, g, className }: { text: string; g: Glossary | null; className?: string }) {
  const link: LinkRender = (l, label, key) => (
    <RuleTrigger key={key} source={l} className="font-semibold text-fg underline decoration-accent/60 decoration-dotted underline-offset-2">
      {label}
    </RuleTrigger>
  );
  return (
    <div className={className}>
      <Rich text={text} g={g} link={link} />
    </div>
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
