/*
 * Единый справочник «Очки»: какие виды очков есть в игре, что они значат и сколько их в ростере.
 *
 * Две разные группы — их нельзя смешивать:
 *   • army — очки сборки армии (стоимость юнитов, улучшений, лимиты). Считаются ТОЛЬКО существующими движками
 *     (aos/engine.ts → pointsOf / computeAos, engine/compute.ts → computeRoster), здесь лишь раскладываются по строкам;
 *   • game — очки, которые набираются и тратятся во время партии (победные очки, очки команд). В данных Wahapedia
 *     их нет; правила взяты из опубликованных правил с указанием источника и редакции. Чего нет в проверенных
 *     источниках — помечено как недоступное, а не придумано.
 *
 * Новый вид очков = ещё один элемент PointSystem; интерфейс (ui/PointsSheet.tsx) показывает любой список без правок.
 */
import type { AosComputed, AosLookup } from './aos/engine';
import { AOS_RULES } from './aos/rules';
import type { AosRoster } from './aos/types';
import { castInfo } from './aos/refs';
import type { ComputedRoster, DataLookup } from './engine/compute';
import { BATTLE_SIZES } from './engine/rules';
import type { Roster } from './engine/types';

export type PointCategory = 'army' | 'game';

export interface PointLine {
  label: string;
  value: string;
  /** пояснение мелким шрифтом */
  note?: string;
  /** значение нарушает правило (красным) */
  bad?: boolean;
}

export interface PointSource {
  label: string;
  url?: string;
}

export interface PointSystem {
  id: string;
  category: PointCategory;
  /** «Очки армии», «Победные очки (VP)» */
  title: string;
  /** что это и когда используется */
  about: string;
  lines: PointLine[];
  /** computed — посчитано по ростеру; reference — правило без расчёта; unavailable — данных нет */
  status: 'computed' | 'reference' | 'unavailable';
  /** правило зависит от редакции, батлпака, миссии или режима — показывается отдельной строкой */
  context?: string;
  sources?: PointSource[];
}

const n = (x: number) => x.toLocaleString('ru-RU');

// ---------- Age of Sigmar ----------

export const AOS_SOURCES = {
  coreRules: { label: 'Age of Sigmar 4 — Core Rules', url: 'https://wahapedia.ru/aos4/the-rules/the-core-rules/' },
  gh: { label: 'General’s Handbook 2026-27 (Pitched Battles)', url: 'https://wahapedia.ru/aos4/the-rules/general-s-handbook-2026-27/' },
  battleProfiles: { label: 'Battle Profiles (очки юнитов) — выгрузка Wahapedia' },
  cpSecondary: { label: 'Обзор правил AoS 4 (вторичный источник)', url: 'https://www.tabletopbattles.com/age-of-sigmar-advanced-rules' },
} satisfies Record<string, PointSource>;

/**
 * Победные очки в битвенных планах General’s Handbook 2026-27 (Pitched Battles), в конце каждого хода игрока.
 * Так считают большинство битвенных планов; у части планов свои условия — см. AOS_VP_EXCEPTIONS.
 */
export const AOS_VP = {
  battleRounds: 5,
  objectives: [
    { id: 'one', label: 'Контролируете хотя бы 1 объектив', vp: 3 },
    { id: 'two', label: 'Контролируете 2 и больше объективов', vp: 3 },
    { id: 'more', label: 'Контролируете больше объективов, чем противник', vp: 4 },
  ],
  /** каждая выполненная тактика (Affray → Strike → Domination по порядку) */
  battleTactic: 5,
  /** карт тактик на армию; за ход — по одной тактике с каждой карты */
  battleTacticCards: 2,
  /** перевес для крупной победы */
  majorVictoryMargin: 5,
} as const;

export const AOS_VP_EXCEPTIONS =
  'Свои условия у планов Bloodstained Coasts, Avalanche of Ash, Caverns of Slaughter, What’s Yours Is Ours, Curse of the Gnaw, Seize the Embers, Treacherous Ground, Power of the Realms, Warped Ruins — сверяйтесь с картой плана.';

export function aosPointSystems(r: AosRoster, L: AosLookup, cr: AosComputed): PointSystem[] {
  const p = cr.points;
  const half = r.pointsLimit * AOS_RULES.maxShareOfOneUnit;
  const formation = r.formationId ? L.formation.get(r.formationId) : undefined;
  const commands = new Set<string>();
  for (const w of L.faction.warscrolls) for (const a of w.abilities) if (castInfo(a.value)?.kind === 'command') commands.add(a.name);
  for (const a of L.faction.battleTraits) if (castInfo(a.value)?.kind === 'command') commands.add(a.name);
  const line = (label: string, v: number, note?: string): PointLine => ({ label, value: v ? n(v) : '0', note });
  return [
    {
      id: 'aos-army',
      category: 'army',
      title: 'Очки армии',
      about: 'Стоимость армии при сборке. Сумма не должна превышать лимит игры; один юнит (с улучшениями) — не больше половины лимита.',
      status: 'computed',
      lines: [
        { label: 'Итого', value: `${n(p.total)} / ${n(r.pointsLimit)}`, bad: p.total > r.pointsLimit },
        line('Юниты (с усилением)', p.units, 'Усиленный юнит — вдвое больше моделей и вдвое дороже.'),
        line('Улучшения', p.enhancements, 'Цена из Battle Profiles; у большинства улучшений 0.'),
        line('Боевое построение', p.formation, formation ? formation.name : 'Не выбрано'),
        line('Лоры', p.lores, 'Заклинания, молитвы и манифестации: очки платятся за лор целиком.'),
        line('Террейн фракции', p.terrain),
        line('Полк славы', p.ror),
        line('Доплата за вспомогательные юниты', p.auxiliary, `Каждый вспомогательный юнит после первого: +${AOS_RULES.auxiliarySurcharge}, +${AOS_RULES.auxiliarySurcharge * 2}, … (накопительно).`),
        { label: 'Половина лимита на один юнит', value: n(half), bad: cr.issues.some((i) => i.code === 'share') },
      ],
      context: 'Лимиты 1000 и 2000 очков; очки — Battle Profiles в выгрузке Wahapedia.',
      sources: [AOS_SOURCES.battleProfiles, AOS_SOURCES.coreRules],
    },
    {
      id: 'aos-drops',
      category: 'army',
      title: 'Высадки',
      about: 'Не очки, но считаются при сборке: каждый полк, вспомогательный юнит и полк славы — отдельная высадка. Меньше высадок — больше шансов выбрать, кто ходит первым.',
      status: 'computed',
      lines: [{ label: 'Высадок', value: String(cr.drops), note: `Полков: ${r.regiments.length}, вспомогательных: ${r.auxiliaries.length}${r.ror ? ', полк славы: 1' : ''}` }],
      sources: [AOS_SOURCES.coreRules],
    },
    {
      id: 'aos-vp',
      category: 'game',
      title: 'Победные очки (VP)',
      about: 'Набираются во время партии и определяют победителя. Считаются в конце каждого хода игрока.',
      status: 'reference',
      lines: [
        ...AOS_VP.objectives.map((o) => ({ label: o.label, value: `+${o.vp}` })),
        { label: 'Выполненная боевая тактика', value: `+${AOS_VP.battleTactic}`, note: `До ${AOS_VP.battleTacticCards} карт тактик; за свой ход — по одной тактике с каждой карты, по порядку Affray → Strike → Domination.` },
        { label: 'Крупная победа', value: `≥ ${AOS_VP.majorVictoryMargin} VP`, note: 'Перевес меньше — малая победа. При равенстве VP побеждает тот, кто выполнил больше тактик.' },
        { label: 'Раундов', value: String(AOS_VP.battleRounds) },
      ],
      context: `General’s Handbook 2026-27, Pitched Battles. ${AOS_VP_EXCEPTIONS}`,
      sources: [AOS_SOURCES.gh],
    },
    {
      id: 'aos-cp',
      category: 'game',
      title: 'Очки команд (CP)',
      about: 'Тратятся на команды (Redeploy, All-out Attack, …) и способности со стоимостью «Команда N». Отстающий по VP игрок — underdog раунда.',
      status: 'reference',
      lines: [
        { label: 'В начале раунда', value: '4 CP', note: 'Неистраченные CP сгорают в конце раунда.' },
        { label: 'Underdog (меньше VP)', value: '+1 CP' },
        { label: 'Стоимость команд армии', value: commands.size ? `${commands.size} способн.` : '—', note: 'Стоимость показана меткой «КОМАНДА N CP» у способности.' },
      ],
      context: 'Числа CP — по вторичному источнику: в выгрузке Wahapedia и на проверенных страницах правил их текста нет. Сверьтесь с Core Rules (Commands).',
      sources: [AOS_SOURCES.cpSecondary, AOS_SOURCES.coreRules],
    },
  ];
}

// ---------- Warhammer 40,000 ----------

export function w40kPointSystems(roster: Roster, L: DataLookup, cr: ComputedRoster): PointSystem[] {
  const size = BATTLE_SIZES[roster.battleSize];
  const base = cr.units.reduce((s, c) => s + c.base, 0);
  const extras = cr.units.reduce((s, c) => s + c.extras, 0);
  const enh = cr.units.reduce((s, c) => s + c.enhancementCost, 0);
  const strats = L.faction.stratagems.filter((s) => cr.detachments.some((d) => d.id === s.detachment));
  const byCp = new Map<string, number>();
  for (const s of strats) byCp.set(String(s.cp), (byCp.get(String(s.cp)) ?? 0) + 1);
  return [
    {
      id: '40k-army',
      category: 'army',
      title: 'Очки армии',
      about: 'Стоимость армии при сборке: юниты по числу моделей, платное снаряжение и улучшения. Сумма не должна превышать лимит размера игры.',
      status: 'computed',
      lines: [
        { label: 'Итого', value: `${n(cr.points)} / ${n(size.points)}`, bad: cr.points > size.points },
        { label: 'Юниты (по числу моделей)', value: n(base) },
        { label: 'Платное снаряжение', value: n(extras) },
        { label: 'Улучшения', value: n(enh) },
      ],
      context: `${size.label}: ${n(size.points)} очков.`,
      sources: [{ label: 'Munitorum Field Manual — выгрузка Wahapedia' }],
    },
    {
      id: '40k-dp',
      category: 'army',
      title: 'Очки детачментов (DP)',
      about: 'Бюджет на детачменты: у каждого детачмента своя стоимость в DP.',
      status: 'computed',
      lines: [
        { label: 'Потрачено', value: `${cr.dp} / ${cr.dpLimit}`, bad: cr.issues.some((i) => i.code === 'dp') },
        ...(size.singleOverBudget ? [{ label: 'Единственный детачмент', value: `до ${size.singleOverBudget} DP`, note: `В ${size.label} можно взять один детачмент дороже бюджета.` }] : []),
      ],
      context: roster.battleSize === 'onslaught' ? 'Бюджет DP для Onslaught официально не подтверждён.' : undefined,
    },
    {
      id: '40k-enh',
      category: 'army',
      title: 'Улучшения',
      about: 'Число улучшений ограничено размером игры (их очки входят в «Очки армии»).',
      status: 'computed',
      lines: [{ label: 'Взято', value: `${cr.enhancementsUsed} / ${cr.enhancementsLimit}`, bad: cr.issues.some((i) => i.code === 'enh-cap') }],
    },
    {
      id: '40k-cp',
      category: 'game',
      title: 'Очки команд (CP)',
      about: 'Тратятся на стратагемы во время партии. Стоимость каждой стратагемы — в карточке детачмента.',
      status: strats.length ? 'computed' : 'unavailable',
      lines: strats.length
        ? [...byCp].sort((a, b) => Number(a[0]) - Number(b[0])).map(([cp, k]) => ({ label: `Стратагем за ${cp} CP`, value: String(k) }))
        : [{ label: 'Стратагемы', value: '—', note: 'Детачмент не выбран.' }],
      context: 'Сколько CP игрок получает за раунд — в данных конструктора нет; смотрите основные правила редакции.',
    },
    {
      id: '40k-vp',
      category: 'game',
      title: 'Победные очки (VP)',
      about: 'Начисляются за основные и вторичные задачи миссии.',
      status: 'unavailable',
      lines: [{ label: 'Начисление VP', value: '—', note: 'Задачи миссий не входят в выгрузку Wahapedia; конструктор их не считает.' }],
      context: 'Зависит от миссионного пакета.',
    },
  ];
}
