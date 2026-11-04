import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { loadKtGame, loadKtTeam, loadWarcryFaction, loadWarcryGame } from '../../data';
import { decodeKtRoster, type KtRoster } from '../../kt/roster';
import type { KtIndex } from '../../kt/types';
import type { SkirmishGameData, SkirmishSystem } from '../../skirmish/types';
import { buildKtUnits, buildWarcryUnits, FOE_PREFIX, otherSide, parseSave, restoreUnits, skirmishUid, type ArmyKey, type Pt, type Side, type TAArmy, type TASave, type TAUnit } from '../../testarmy';
import { pushOverlay, tg, openExternal } from '../../telegram';
import { decodeWarcryRoster, neededFactions, type WarcryRoster } from '../../warcry/roster';
import type { WarcryIndex } from '../../warcry/types';
import { Button, IconButton, Segmented, Sheet } from '../kit';
import { cx } from '../util';
import { Board, type BoardField } from '../testarmy/Board';
import { KtMapPanel, WarcryDeploymentPanel } from './SkirmishMaps';
import type { SkirmishRoster } from './SkirmishGameScreen';

type FoeSpec = { kind: 'none' } | { kind: 'own'; rosterId: string } | { kind: 'code'; code: string };
type Loaded<R extends SkirmishRoster> = { roster: R; units: TAUnit[]; stats: (u: TAUnit) => string | null; info: (u: TAUnit, onClose: () => void) => ReactNode };
type Army<R extends SkirmishRoster> = TAArmy & Loaded<R>;
type Loader<R extends SkirmishRoster> = (roster: R, prefix?: string) => Promise<Loaded<R>>;

export function KtTestArmyScreen({ onBack, rosters, index, initialRosterId }: { onBack: () => void; rosters: KtRoster[]; index: KtIndex; initialRosterId?: string }) {
  return <SkirmishTestArmyScreen system="kt" onBack={onBack} rosters={rosters} index={index} initialRosterId={initialRosterId} loader={loadKtArmy} />;
}

export function WarcryTestArmyScreen({ onBack, rosters, index, initialRosterId }: { onBack: () => void; rosters: WarcryRoster[]; index: WarcryIndex; initialRosterId?: string }) {
  return <SkirmishTestArmyScreen system="warcry" onBack={onBack} rosters={rosters} index={index} initialRosterId={initialRosterId} loader={loadWarcryArmy} />;
}

async function loadKtArmy(roster: KtRoster, prefix = ''): Promise<Loaded<KtRoster>> {
  const team = await loadKtTeam(roster.teamId);
  const units = buildKtUnits(roster, team, prefix);
  const opOf = (u: TAUnit) => {
    const selected = roster.operatives.find((x) => x.uid === skirmishUid(u.uid));
    return { selected, op: team.operatives.find((o) => o.id === selected?.opTypeId) };
  };
  return {
    roster,
    units,
    stats: (u) => {
      const { op } = opOf(u);
      return op ? `Move ${op.stats.move} · APL ${op.stats.apl} · Save ${op.stats.save} · Wounds ${op.stats.wounds}` : null;
    },
    info: (u, onClose) => {
      const { selected, op } = opOf(u);
      const weapons = op?.weapons.filter((w) => selected?.weapons.includes(w.id)) ?? [];
      return <InfoSheet title={u.name} onClose={onClose} lines={op ? [`Move ${op.stats.move} · APL ${op.stats.apl} · Save ${op.stats.save} · Wounds ${op.stats.wounds}`, `База: ${op.baseMm ? `${op.baseMm} мм` : 'нет данных'}`] : []} weapons={weapons.map((w) => w.name)} />;
    },
  };
}

async function loadWarcryArmy(roster: WarcryRoster, prefix = ''): Promise<Loaded<WarcryRoster>> {
  const factions = await Promise.all(neededFactions(roster).map(loadWarcryFaction));
  const data = new Map(factions.map((f) => [f.id, f]));
  const units = buildWarcryUnits(roster, data, prefix);
  const fighterOf = (u: TAUnit) => {
    const selected = roster.fighters.find((x) => x.uid === skirmishUid(u.uid));
    return data.get(selected?.factionId ?? '')?.fighters.find((f) => f.id === selected?.fighterId);
  };
  return {
    roster,
    units,
    stats: (u) => {
      const f = fighterOf(u);
      return f ? `Move ${f.movement} · Toughness ${f.toughness} · Wounds ${f.wounds} · ${f.points} очк.` : null;
    },
    info: (u, onClose) => {
      const f = fighterOf(u);
      return <InfoSheet title={u.name} onClose={onClose} lines={f ? [`Move ${f.movement} · Toughness ${f.toughness} · Wounds ${f.wounds}`, 'Размер базы отсутствует в warcry_data — задайте его вручную.'] : []} weapons={f?.weapons.map((w) => `${w.runemark || 'Оружие'} · Range ${w.minRange ? `${w.minRange}-` : ''}${w.maxRange}" · A ${w.attacks} · S ${w.strength} · D ${w.dmgHit}/${w.dmgCrit}`) ?? []} />;
    },
  };
}

function SkirmishTestArmyScreen<R extends SkirmishRoster>({ system, onBack, rosters, index, initialRosterId, loader }: { system: SkirmishSystem; onBack: () => void; rosters: R[]; index: KtIndex | WarcryIndex; initialRosterId?: string; loader: Loader<R> }) {
  const [data, setData] = useState<SkirmishGameData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rosterId, setRosterId] = useState<string | null>(initialRosterId ?? null);
  const [layoutId, setLayoutId] = useState(system === 'kt' ? 'official:Non-Specific Killzone Maps:1' : 'battleplan:first-blood:red');
  const [side, setSide] = useState<Side>('attacker');
  const [armies, setArmies] = useState<Army<R>[] | null>(null);
  const [step, setStep] = useState<'roster' | 'field' | 'board'>(initialRosterId ? 'field' : 'roster');
  const roster = rosters.find((r) => r.id === rosterId) ?? null;
  const storageKey = useCallback((id: string) => `warphub.testarmy.${system}.v1${tg?.initDataUnsafe.user?.id ? `.${tg.initDataUnsafe.user.id}` : ''}.${id}`, [system]);
  const readSaved = (id: string) => {
    try { return parseSave(localStorage.getItem(storageKey(id))); } catch { return null; }
  };
  const [saved, setSaved] = useState<TASave | null>(() => (initialRosterId ? readSaved(initialRosterId) : null));

  useEffect(() => {
    (system === 'kt' ? loadKtGame() : loadWarcryGame()).then(setData, (e) => setError(String(e?.message ?? e)));
  }, [system]);
  useEffect(() => {
    if (step === 'board') return pushOverlay(() => setStep('field'));
    if (step === 'field' && !initialRosterId) return pushOverlay(() => setStep('roster'));
    return undefined;
  }, [step, initialRosterId]);
  useEffect(() => {
    if (step !== 'board' || !roster || !armies) return;
    try {
      const value: TASave = { v: 2, rosterId: roster.id, layoutId, side, savedAt: new Date().toISOString(), armies: armies.map(({ key, side: sd, rosterId: rid, code, units }) => ({ key, side: sd, ...(rid ? { rosterId: rid } : {}), ...(code ? { code } : {}), units })) };
      localStorage.setItem(storageKey(roster.id), JSON.stringify(value));
    } catch { /* сохранение недоступно */ }
  }, [step, roster, layoutId, side, armies, storageKey]);

  const detail = (r: R) => {
    if (r.system === 'kt' && 'teams' in index) return `${index.teams.find((t) => t.id === r.teamId)?.name ?? r.teamId} · ${r.operatives.length} опер.`;
    if (r.system === 'warcry' && 'factions' in index) return `${index.factions.find((f) => f.id === r.factionId)?.name ?? r.factionId} · ${r.fighters.length} бойц.`;
    return '';
  };
  const decode = (code: string): R | null => {
    try {
      if (system === 'kt' && 'teams' in index) return decodeKtRoster(code, index.teams.map((t) => t.id)) as R;
      if (system === 'warcry' && 'factions' in index) return decodeWarcryRoster(code, index.factions.map((f) => f.id)) as R;
      return null;
    } catch { return null; }
  };
  const deploy = async (foe: FoeSpec, restored?: TASave) => {
    if (!roster) return;
    setStep('board');
    setArmies(null);
    const foeRoster = foe.kind === 'own' ? rosters.find((r) => r.id === foe.rosterId) : foe.kind === 'code' ? decode(foe.code) : null;
    const parts: { key: ArmyKey; roster: R; side: Side; spec?: FoeSpec }[] = [{ key: 'me', roster, side }];
    if (foeRoster) parts.push({ key: 'foe', roster: foeRoster, side: otherSide(side), spec: foe });
    try {
      const loaded = await Promise.all(parts.map((p) => loader(p.roster, p.key === 'foe' ? FOE_PREFIX : '')));
      setArmies(parts.map((p, i) => ({
        key: p.key,
        side: p.side,
        ...(p.spec?.kind === 'own' ? { rosterId: p.spec.rosterId } : p.spec?.kind === 'code' ? { code: p.spec.code } : { rosterId: p.roster.id }),
        ...loaded[i]!,
        units: restored ? restoreUnits(loaded[i]!.units, restored.armies.find((a) => a.key === p.key)?.units ?? []) : loaded[i]!.units,
      })));
    } catch (e) { setError(String(e instanceof Error ? e.message : e)); }
  };
  const setArmyUnits = (key: ArmyKey, units: TAUnit[]) => setArmies((list) => list && list.map((a) => (a.key === key ? { ...a, units } : a)));

  if (error) return <Shell onBack={onBack} system={system}><p className="mt-10 text-center text-sm text-fg-3">{error}</p></Shell>;
  if (!data) return <Shell onBack={onBack} system={system}><Spinner /></Shell>;
  if (step === 'board' && roster) {
    if (!armies) return <Spinner full />;
    return <Board armies={armies.map((a) => ({ ...a, name: a.roster.name }))} field={makeField(data, layoutId)} onArmy={setArmyUnits} onBack={() => setStep('field')} />;
  }
  if (step === 'field' && roster) {
    return (
      <Shell onBack={initialRosterId ? onBack : () => setStep('roster')} system={system}>
        {saved && <div className="mb-3 rounded-2xl border border-accent/40 bg-accent/10 p-3"><p className="text-sm font-semibold">Сохранённая расстановка</p><p className="mt-0.5 text-[12px] text-fg-3">{layoutName(saved.layoutId)} · {saved.side === 'attacker' ? 'атакующий' : 'защитник'}</p><Button variant="primary" className="mt-2 w-full" onClick={() => { setLayoutId(saved.layoutId); setSide(saved.side); const f = saved.armies.find((a) => a.key === 'foe'); void deploy(f?.code ? { kind: 'code', code: f.code } : f?.rosterId ? { kind: 'own', rosterId: f.rosterId } : { kind: 'none' }, saved); }}>Продолжить</Button></div>}
        <FieldPicker data={data} roster={roster} rosters={rosters} detail={detail} decode={decode} layoutId={layoutId} onLayout={setLayoutId} side={side} onSide={setSide} onDeploy={(foe) => void deploy(foe)} />
      </Shell>
    );
  }
  return (
    <Shell onBack={onBack} system={system}>
      <p className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-fg-3">Ростер</p>
      {!rosters.length && <p className="text-sm text-fg-3">Сначала соберите {system === 'kt' ? 'команду Kill Team' : 'варбанду Warcry'}.</p>}
      <ul className="space-y-1.5">{rosters.map((r) => <li key={r.id}><button type="button" onClick={() => { setRosterId(r.id); setSaved(readSaved(r.id)); setStep('field'); }} className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left active:bg-white/10"><span className="block truncate text-sm font-semibold">{r.name}</span><span className="block text-[12px] text-fg-3">{detail(r)}</span></button></li>)}</ul>
    </Shell>
  );
}

function FieldPicker<R extends SkirmishRoster>({ data, roster, rosters, detail, decode, layoutId, onLayout, side, onSide, onDeploy }: { data: SkirmishGameData; roster: R; rosters: R[]; detail: (r: R) => string; decode: (code: string) => R | null; layoutId: string; onLayout: (id: string) => void; side: Side; onSide: (s: Side) => void; onDeploy: (foe: FoeSpec) => void }) {
  const [foeKind, setFoeKind] = useState<FoeSpec['kind']>('none');
  const [foeId, setFoeId] = useState('');
  const [code, setCode] = useState('');
  const codeError = code.trim() && !decode(code) ? `Нужен корректный код ${data.system === 'kt' ? 'KT1.' : 'WC1.'}` : null;
  const foeSpec: FoeSpec | null = foeKind === 'none' ? { kind: 'none' } : foeKind === 'own' ? (foeId ? { kind: 'own', rosterId: foeId } : null) : code.trim() && !codeError ? { kind: 'code', code: code.trim() } : null;
  const official = layoutId.startsWith('official:') ? layoutId.split(':') : null;
  const killzone = data.system === 'kt' ? (official?.[1] ?? data.missionPack.killzones[0]!) : '';
  const mapNumber = Number(official?.[2] ?? 1);
  const chooseOfficial = (zone: string, map: number) => onLayout(`official:${zone}:${map}`);
  const battle = layoutId.startsWith('battleplan:') ? layoutId.split(':') : null;
  const deploymentId = data.system === 'warcry' ? (battle?.[1] ?? data.deployments[0]!.id) : '';
  const battleColor = data.system === 'warcry' ? (battle?.[2] ?? 'red') : 'red';
  const chooseBattleplan = (id: string, color: string) => onLayout(`battleplan:${id}:${color}`);
  const officialMap = data.system === 'kt' ? data.maps.find((item) => item.killzone === killzone && item.map === mapNumber) : null;
  const battleDeployment = data.system === 'warcry' ? data.deployments.find((item) => item.id === deploymentId) : null;
  return (
    <section className="space-y-3">
      <p className="truncate text-sm">Ростер: <b>{roster.name}</b></p>
      <div>
        <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wider text-fg-3">Вариант расстановки · поле {data.board.width}×{data.board.height}″</p>
        {data.system === 'kt' ? (
          <div className="grid grid-cols-[minmax(0,1fr)_5rem] gap-2">
            <select value={killzone} onChange={(e) => chooseOfficial(e.target.value, 1)} className="h-11 min-w-0 rounded-xl border border-white/10 bg-app-elevated px-3 text-sm">{data.missionPack.killzones.map((zone) => <option key={zone}>{zone}</option>)}</select>
            <select value={mapNumber} onChange={(e) => chooseOfficial(killzone, Number(e.target.value))} className="h-11 rounded-xl border border-white/10 bg-app-elevated px-3 text-sm">{Array.from({ length: data.missionPack.mapsPerKillzone }, (_, i) => <option key={i + 1} value={i + 1}>Карта {i + 1}</option>)}</select>
          </div>
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
            <select value={deploymentId} onChange={(e) => chooseBattleplan(e.target.value, battleColor)} className="h-11 min-w-0 rounded-xl border border-white/10 bg-app-elevated px-3 text-sm">{data.deployments.map((deployment) => <option key={deployment.id} value={deployment.id}>{deployment.table === 'tableA' ? 'A' : 'B'} · {deployment.name}</option>)}</select>
            <select value={battleColor} onChange={(e) => chooseBattleplan(deploymentId, e.target.value)} className="h-11 rounded-xl border border-white/10 bg-app-elevated px-3 text-sm"><option value="red">Красные</option><option value="blue">Синие</option></select>
          </div>
        )}
      </div>
      {officialMap && <KtMapPanel map={officialMap} />}
      {battleDeployment && <WarcryDeploymentPanel deployment={battleDeployment} color={battleColor} />}
      <div><p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wider text-fg-3">Ваша сторона</p><Segmented<Side> value={side} onChange={onSide} options={[{ value: 'attacker', label: 'Атакующий' }, { value: 'defender', label: 'Защитник' }]} /></div>
      <div>
        <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wider text-fg-3">Соперник</p>
        <Segmented<FoeSpec['kind']> value={foeKind} onChange={setFoeKind} options={[{ value: 'none', label: 'Без соперника' }, { value: 'own', label: 'Мой ростер' }, { value: 'code', label: 'Код ростера' }]} />
        {foeKind === 'own' && <select value={foeId} onChange={(e) => setFoeId(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-app-elevated px-3 text-sm"><option value="">Выберите ростер</option>{rosters.map((r) => <option key={r.id} value={r.id}>{r.name} · {detail(r)}</option>)}</select>}
        {foeKind === 'code' && <div className="mt-2"><textarea value={code} onChange={(e) => setCode(e.target.value)} rows={3} placeholder={`${data.system === 'kt' ? 'KT1.' : 'WC1.'}…`} className="w-full rounded-lg border border-white/10 bg-white/[0.04] p-2.5 font-mono text-xs outline-none focus:border-accent" />{codeError && <p className="mt-1 text-xs text-danger">{codeError}</p>}</div>}
      </div>
      <Button variant="primary" className="h-12 w-full" disabled={!foeSpec} onClick={() => foeSpec && onDeploy(foeSpec)}>{foeKind === 'none' ? 'Расставить армию' : 'Расставить армии'}</Button>
      <button type="button" onClick={() => openExternal(data.system === 'kt' ? data.missionPack.url : data.source.url)} className="w-full rounded-xl border border-white/10 px-3 py-2 text-left text-[12px] text-fg-3">Официальные миссии и карты: {data.source.name} →</button>
    </section>
  );
}

const LAYOUTS: Record<string, string> = { 'edges-x': 'Края ← →', 'edges-y': 'Края ↑ ↓', free: 'Свободно' };
const layoutName = (id: string) => {
  if (id.startsWith('official:')) {
    const [, zone, map] = id.split(':');
    return `${zone} · Карта ${map}`;
  }
  if (id.startsWith('battleplan:')) {
    const [, deployment, color] = id.split(':');
    return `${deployment} · ${color === 'red' ? 'красные' : 'синие'}`;
  }
  return LAYOUTS[id] ?? id;
};
function zones(layoutId: string): Partial<Record<Side, Pt[][]>> {
  if (layoutId === 'edges-x') return { attacker: [[[0, 0], [6, 0], [6, 22], [0, 22]]], defender: [[[24, 0], [30, 0], [30, 22], [24, 22]]] };
  if (layoutId === 'edges-y') return { attacker: [[[0, 0], [30, 0], [30, 6], [0, 6]]], defender: [[[0, 16], [30, 16], [30, 22], [0, 22]]] };
  return {};
}
function makeField(data: SkirmishGameData, layoutId: string): BoardField {
  if (data.system === 'kt' && layoutId.startsWith('official:')) {
    const [, zone, number] = layoutId.split(':');
    const map = data.maps.find((item) => item.killzone === zone && item.map === Number(number));
    if (map) {
      return {
        title: layoutName(layoutId),
        background: <KtMapPanel map={map} interactive={false} />,
        objectives: map.objectives.map((o) => ({ x: o.x, y: o.y, role: o.id })),
        snapPoints: map.objectives.map((o) => [o.x, o.y] as Pt),
        zones: { attacker: map.zones.p1, defender: map.zones.p2 },
        objectiveNote: 'Objective marker — 40 мм; control range — 1″. Drop zones и маркеры из Approved Ops. Контуры террейна приблизительные: официальные карты не являются точными размерами.',
        width: data.board.width,
        height: data.board.height,
      };
    }
  }
  if (data.system === 'warcry' && layoutId.startsWith('battleplan:')) {
    const [, deploymentId, color] = layoutId.split(':');
    const deployment = data.deployments.find((item) => item.id === deploymentId);
    if (deployment) {
      const own = deployment.points.filter((point) => point.side === color);
      const enemy = deployment.points.filter((point) => point.side !== color);
      return {
        title: layoutName(layoutId),
        background: <WarcryDeploymentPanel deployment={deployment} color={color} interactive={false} />,
        objectives: deployment.points.map((point) => ({ x: point.x, y: point.y, role: `${point.side}:${point.group}` })),
        snapPoints: deployment.points.map((point) => [point.x, point.y] as Pt),
        zones: { attacker: own.map((point) => circleZone(point.x, point.y, 3)), defender: enemy.map((point) => circleZone(point.x, point.y, 3)) },
        objectiveNote: 'Deployment groups — wholly within 3″ horizontally от соответствующей точки. RND2/RND3 — резерв, а не начальная расстановка. Пунктирные круги — зоны 3″, не objective markers.',
        width: data.board.width,
        height: data.board.height,
      };
    }
  }
  return { title: `${layoutName(layoutId)} · пользовательские зоны`, background: <SkirmishMap data={data} layoutId={layoutId} />, objectives: [], snapPoints: [], zones: zones(layoutId), objectiveNote: data.system === 'kt' ? 'Objective marker — 40 мм; control range — 1″. Зоны здесь пользовательские, не карта Approved Ops.' : 'Deployment groups — wholly within 3″ своего deployment point. Здесь — тренировочная расстановка без карты battleplan.', width: data.board.width, height: data.board.height };
}
function circleZone(cx: number, cy: number, radius: number): Pt[] {
  return Array.from({ length: 32 }, (_, i) => {
    const angle = (i / 32) * Math.PI * 2;
    return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius] as Pt;
  });
}
function SkirmishMap({ data, layoutId }: { data: SkirmishGameData; layoutId: string }) {
  const w = data.board.width, h = data.board.height;
  const disp = ([x, y]: Pt): Pt => [h - y, x];
  const z = zones(layoutId);
  return <svg viewBox={`-1.5 -1.5 ${h + 3} ${w + 3}`} className="block h-full w-full" role="img" aria-label="Поле 30 на 22 дюйма"><rect width={h} height={w} fill="#1b1d22" />{(['attacker', 'defender'] as Side[]).flatMap((side) => (z[side] ?? []).map((pts, i) => <polygon key={`${side}-${i}`} points={pts.map((p) => disp(p).join(',')).join(' ')} fill={side === 'attacker' ? 'rgba(248,113,113,0.16)' : 'rgba(96,165,250,0.16)'} stroke={side === 'attacker' ? '#f87171' : '#60a5fa'} strokeWidth={0.15} />))}<line x1={h / 2} y1={0} x2={h / 2} y2={w} stroke="rgba(255,255,255,0.15)" strokeWidth={0.12} /><line x1={0} y1={w / 2} x2={h} y2={w / 2} stroke="rgba(255,255,255,0.15)" strokeWidth={0.12} /><rect width={h} height={w} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={0.2} /></svg>;
}
function InfoSheet({ title, onClose, lines, weapons }: { title: string; onClose: () => void; lines: string[]; weapons: string[] }) {
  return <Sheet open onClose={onClose} title={title}><div className="space-y-3 pb-3">{lines.map((line, i) => <p key={i} className="text-sm text-fg-2">{line}</p>)}{weapons.length > 0 && <div><p className="mb-1 text-xs font-semibold uppercase tracking-wider text-fg-3">Оружие</p><ul className="space-y-1 text-[13px] text-fg-2">{weapons.map((w, i) => <li key={i}>{w}</li>)}</ul></div>}</div></Sheet>;
}
function Shell({ onBack, system, children }: { onBack: () => void; system: SkirmishSystem; children: ReactNode }) {
  return <div className="mx-auto min-h-dvh max-w-lg px-4 pb-24 pt-5"><header className="mb-4 flex items-end gap-3"><IconButton icon="back" label="Назад" onClick={onBack} className="mb-0.5 size-9" /><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">WarpBuilder · {system === 'kt' ? 'Kill Team' : 'Warcry'}</p><h1 className="font-display mt-1 text-3xl font-semibold uppercase leading-none">Test Army</h1></div></header>{children}</div>;
}
function Spinner({ full }: { full?: boolean }) { return <div className={cx(full && 'flex min-h-dvh items-center justify-center')}><div className={cx('mx-auto size-8 animate-spin rounded-full border-2 border-white/15 border-t-accent', !full && 'mt-16')} /></div>; }
