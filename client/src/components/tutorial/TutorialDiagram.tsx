import { useId, type ReactNode } from "react";
import type { TutorialDiagram } from "./content";

/**
 * Схемы обучения: базы сверху (свои — салатовые, враг — красный), стрелки расстояний, таблицы профилей.
 * Оригинальные рисунки клуба, без изображений миниатюр GW. Ширина 320, масштабируются по ширине карточки.
 */
const A = "#ECFE46";
const R = "#F87171";
const W = "#F4F4F0";
const F2 = "#B8B8B0";
const F3 = "#8E8E86";
const PANEL = "#2C2C29";
const LIGHT = "#ECECE4";
const HEAD = "#3B4A44";

type Ids = { white: string; accent: string; red: string; dots: string };

function Base({ x, y, r = 13, c = A }: { x: number; y: number; r?: number; c?: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill="#121211" stroke={c} strokeWidth={2.5} />
      <circle cx={x} cy={y} r={r - 6} fill={c} opacity={0.22} />
    </g>
  );
}

function Tag({ x, y, children, c = W, bg = PANEL }: { x: number; y: number; children: string; c?: string; bg?: string }) {
  const w = children.length * 6.6 + 14;
  return (
    <g>
      <rect x={x - w / 2} y={y - 11} width={w} height={20} rx={10} fill={bg} />
      <text x={x} y={y + 3} textAnchor="middle" fontSize={11.5} fontWeight={700} fill={c}>
        {children}
      </text>
    </g>
  );
}

function Measure({ x1, x2, y, label, c = W, marker }: { x1: number; x2: number; y: number; label: string; c?: string; marker: string }) {
  return (
    <g>
      <line x1={x1} y1={y} x2={x2} y2={y} stroke={c} strokeWidth={1.6} markerStart={`url(#${marker})`} markerEnd={`url(#${marker})`} />
      <Tag x={(x1 + x2) / 2} y={y - 14} c={c}>
        {label}
      </Tag>
    </g>
  );
}

const Tick = ({ x, y1, y2 }: { x: number; y1: number; y2: number }) => (
  <line x1={x} y1={y1} x2={x} y2={y2} stroke="rgba(255,255,255,.45)" strokeDasharray="3 3" />
);

const Ghost = ({ x, y, c = A }: { x: number; y: number; c?: string }) => (
  <circle cx={x} cy={y} r={13} fill="none" stroke={c} strokeWidth={2} strokeDasharray="3 3" />
);

const Die = ({ x, y, pips }: { x: number; y: number; pips: [number, number][] }) => (
  <g>
    <rect x={x} y={y} width={22} height={22} rx={5} fill={LIGHT} />
    {pips.map(([px, py]) => (
      <circle key={`${px}-${py}`} cx={x + px} cy={y + py} r={2} fill="#111" />
    ))}
  </g>
);

function Round() {
  const names = ["Командование", "Движение", "Стрельба", "Нападение", "Сражение"];
  return (
    <>
      <ellipse cx={160} cy={100} rx={96} ry={62} fill="none" stroke="rgba(236,254,70,.35)" strokeWidth={1.5} strokeDasharray="4 5" />
      {names.map((name, i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
        const x = Math.round(160 + 96 * Math.cos(a));
        const y = Math.round(100 + 62 * Math.sin(a));
        return (
          <g key={name}>
            <circle cx={x} cy={y} r={13} fill={A} />
            <text x={x} y={y + 4} textAnchor="middle" fontSize={12} fontWeight={800} fill="#111">
              {i + 1}
            </text>
            <text x={x} y={y > 100 ? y + 28 : y - 19} textAnchor="middle" fontSize={11} fill={F2}>
              {name}
            </text>
          </g>
        );
      })}
      <text x={160} y={96} textAnchor="middle" fontSize={12} fontWeight={700} fill={W}>
        Ход игрока 1
      </text>
      <text x={160} y={112} textAnchor="middle" fontSize={11} fill={F3}>
        затем ход игрока 2
      </text>
    </>
  );
}

function Profile() {
  const stats = [
    ["M", "6″"],
    ["T", "4"],
    ["Sv", "3+"],
    ["W", "2"],
    ["Ld", "6+"],
    ["OC", "2"],
  ];
  return (
    <>
      {stats.map(([k, v], i) => {
        const x = 14 + i * 50;
        return (
          <g key={k}>
            <text x={x + 22} y={38} textAnchor="middle" fontSize={12} fontWeight={700} fill={F2}>
              {k}
            </text>
            <rect x={x} y={46} width={44} height={44} rx={9} fill={LIGHT} />
            <text x={x + 22} y={75} textAnchor="middle" fontSize={19} fontWeight={800} fill="#141413">
              {v}
            </text>
          </g>
        );
      })}
      <text x={14} y={116} fontSize={11} fill={F3}>
        Пример: отряд пехоты
      </text>
      <path d="M36 92v42h40" fill="none" stroke={A} strokeWidth={1.4} />
      <text x={82} y={138} fontSize={11.5} fill={A}>
        на сколько дюймов ходит модель
      </text>
    </>
  );
}

function Command() {
  return (
    <>
      <rect x={18} y={24} width={120} height={74} rx={12} fill={PANEL} />
      <text x={78} y={58} textAnchor="middle" fontSize={26} fontWeight={800} fill={A}>
        +1 CP
      </text>
      <text x={78} y={80} textAnchor="middle" fontSize={11} fill={F2}>
        каждому игроку
      </text>
      <Base x={194} y={60} r={14} c={R} />
      <Base x={222} y={52} r={14} c={R} />
      <circle cx={208} cy={82} r={14} fill="none" stroke={R} strokeWidth={2} strokeDasharray="3 3" opacity={0.6} />
      <circle cx={236} cy={78} r={14} fill="none" stroke={R} strokeWidth={2} strokeDasharray="3 3" opacity={0.6} />
      <text x={214} y={118} textAnchor="middle" fontSize={11} fill={F2}>
        осталось меньше половины
      </text>
      <Die x={262} y={40} pips={[[6, 6], [16, 16]]} />
      <Die x={288} y={40} pips={[[6, 6], [11, 11], [16, 16]]} />
      <text x={286} y={82} textAnchor="middle" fontSize={11.5} fontWeight={700} fill={W}>
        2D6 ≥ Ld?
      </text>
      <Tag x={160} y={150} c={R} bg="rgba(248,113,113,.14)">
        Меньше Ld — боевой шок: OC 0
      </Tag>
    </>
  );
}

function Move({ ids }: { ids: Ids }) {
  return (
    <>
      <Base x={40} y={52} />
      <line x1={56} y1={52} x2={186} y2={52} stroke={A} strokeWidth={2} markerEnd={`url(#${ids.accent})`} />
      <Tag x={120} y={34} c={A}>
        Обычный ход: до M = 6″
      </Tag>
      <Ghost x={200} y={52} />
      <Base x={40} y={124} />
      <line x1={56} y1={124} x2={250} y2={124} stroke={A} strokeWidth={2} markerEnd={`url(#${ids.accent})`} />
      <Tag x={150} y={106} c={A}>
        Рывок: M + D6″
      </Tag>
      <Ghost x={264} y={124} />
      <text x={150} y={158} textAnchor="middle" fontSize={11} fill={F2}>
        после рывка — без стрельбы и нападения
      </text>
    </>
  );
}

function Weapon() {
  const cols = ["RANGE", "A", "BS", "S", "AP", "D"];
  const vals = ["24″", "2", "3+", "4", "-1", "1"];
  const xs = [44, 104, 150, 196, 242, 290];
  return (
    <>
      <rect x={10} y={40} width={300} height={30} rx={8} fill={HEAD} />
      <rect x={10} y={66} width={300} height={36} rx={8} fill={LIGHT} />
      <rect x={10} y={66} width={300} height={6} fill={LIGHT} />
      {cols.map((c, i) => (
        <g key={c}>
          <text x={xs[i]} y={60} textAnchor="middle" fontSize={12} fontWeight={700} fill={W}>
            {c}
          </text>
          <text x={xs[i]} y={92} textAnchor="middle" fontSize={15} fontWeight={800} fill="#141413">
            {vals[i]}
          </text>
        </g>
      ))}
      <text x={14} y={128} fontSize={11.5} fill={F2}>
        <tspan fill={A} fontWeight={700}>
          BS 3+
        </tspan>{" "}
        — на кубике нужно 3 или больше, чтобы попасть
      </text>
      <text x={14} y={148} fontSize={11.5} fill={F2}>
        <tspan fill={A} fontWeight={700}>
          A 2
        </tspan>{" "}
        — две атаки за каждую модель
      </text>
    </>
  );
}

function Sight({ ids }: { ids: Ids }) {
  return (
    <>
      <Base x={36} y={56} />
      <Base x={286} y={56} r={14} c={R} />
      <line x1={52} y1={56} x2={270} y2={56} stroke={W} strokeWidth={1.6} markerEnd={`url(#${ids.white})`} />
      <Tag x={160} y={40}>
        Видит
      </Tag>
      <Tick x={49} y1={70} y2={92} />
      <Tick x={272} y1={70} y2={92} />
      <Measure x1={49} x2={272} y={86} label="Range = 24″" marker={ids.white} />
      <Base x={36} y={140} />
      <path d="M196 154V122l8-10h18v12h8V112h10v42z" fill="#3A3A36" stroke="#5A5A54" strokeWidth={1.5} />
      <Base x={286} y={140} r={14} c={R} />
      <line x1={52} y1={140} x2={186} y2={140} stroke={R} strokeWidth={1.6} strokeDasharray="5 4" />
      <text x={218} y={170} textAnchor="middle" fontSize={11} fontWeight={700} fill={R}>
        стена
      </text>
      <Tag x={120} y={124} c={R} bg="rgba(248,113,113,.14)">
        Не видит
      </Tag>
    </>
  );
}

function Attack({ ids }: { ids: Ids }) {
  const steps = [
    ["Попадание", "≥ BS"],
    ["Ранение", "S против T"],
    ["Спасбросок", "Sv + AP"],
    ["Урон", "− D ран"],
  ];
  const wound = [
    ["S ≥ 2T", "2+"],
    ["S > T", "3+"],
    ["S = T", "4+"],
    ["S < T", "5+"],
    ["S ≤ T/2", "6+"],
  ];
  return (
    <>
      {steps.map(([t, s], i) => {
        const x = 10 + i * 78;
        return (
          <g key={t}>
            <rect x={x} y={22} width={70} height={72} rx={10} fill={PANEL} />
            <circle cx={x + 16} cy={40} r={10} fill={A} />
            <text x={x + 16} y={44} textAnchor="middle" fontSize={11} fontWeight={800} fill="#111">
              {i + 1}
            </text>
            <text x={x + 35} y={68} textAnchor="middle" fontSize={11} fontWeight={700} fill={W}>
              {t}
            </text>
            <text x={x + 35} y={84} textAnchor="middle" fontSize={10.5} fill={F2}>
              {s}
            </text>
            {i < 3 && <path d={`M${x + 71} 58h6`} stroke={A} strokeWidth={2} markerEnd={`url(#${ids.accent})`} />}
          </g>
        );
      })}
      {wound.map(([k, v], i) => {
        const x = 10 + i * 61;
        return (
          <g key={k}>
            <rect x={x} y={110} width={57} height={22} rx={6} fill={HEAD} />
            <text x={x + 28.5} y={125} textAnchor="middle" fontSize={10.5} fontWeight={700} fill={W}>
              {k}
            </text>
            <rect x={x} y={136} width={57} height={22} rx={6} fill={LIGHT} />
            <text x={x + 28.5} y={152} textAnchor="middle" fontSize={12} fontWeight={800} fill="#141413">
              {v}
            </text>
          </g>
        );
      })}
    </>
  );
}

function Charge({ ids }: { ids: Ids }) {
  return (
    <>
      <Tag x={160} y={34} c={A}>
        Бросок 2D6 = 8″
      </Tag>
      <Base x={160} y={84} />
      <Base x={56} y={84} r={14} c={R} />
      <Base x={272} y={84} r={14} c={R} />
      <Tick x={70} y1={98} y2={126} />
      <Tick x={147} y1={98} y2={126} />
      <Measure x1={70} x2={147} y={120} label="9″" c={R} marker={ids.red} />
      <Tick x={173} y1={98} y2={126} />
      <Tick x={258} y1={98} y2={126} />
      <Measure x1={173} x2={258} y={120} label="8″" c={A} marker={ids.accent} />
      <text x={108} y={148} textAnchor="middle" fontSize={11} fill={R}>
        не хватает
      </text>
      <text x={216} y={148} textAnchor="middle" fontSize={11} fill={A}>
        можно напасть
      </text>
    </>
  );
}

function Fight({ ids }: { ids: Ids }) {
  return (
    <>
      <circle cx={96} cy={84} r={62} fill="none" stroke="rgba(236,254,70,.45)" strokeDasharray="4 4" />
      {[50, 84, 118].map((y) => (
        <Base key={y} x={96} y={y} />
      ))}
      <Base x={128} y={50} c={R} />
      <Base x={128} y={84} c={R} />
      <Base x={222} y={124} c={R} />
      <path d="M208 122 C182 120 164 112 146 98" fill="none" stroke={A} strokeWidth={1.8} markerEnd={`url(#${ids.accent})`} />
      <Tag x={250} y={154} c={A}>
        Сближение до 3″
      </Tag>
      <Tag x={60} y={160} c={A}>
        атакуют в 2″
      </Tag>
      {["1 Сближение", "2 Атаки", "3 Объединение 3″"].map((t, i) => (
        <text key={t} x={254} y={44 + i * 18} textAnchor="middle" fontSize={11} fill={F2}>
          {t}
        </text>
      ))}
    </>
  );
}

function Ready() {
  const items = ["Соберите армию в WarpBuilder", "Запишитесь на тренировку", "Возьмите кубики и рулетку"];
  return (
    <>
      {items.map((t, i) => {
        const y = 36 + i * 40;
        return (
          <g key={t}>
            <rect x={16} y={y - 16} width={26} height={26} rx={8} fill={A} />
            <path d={`M22 ${y - 3}l5 5 9-10`} fill="none" stroke="#111" strokeWidth={2.4} strokeLinecap="round" />
            <text x={54} y={y + 2} fontSize={13} fontWeight={600} fill={W}>
              {t}
            </text>
          </g>
        );
      })}
    </>
  );
}


/* ---------- Age of Sigmar ---------- */
const GOLD = "#E8B84A";

function AosRound({ ids }: { ids: Ids }) {
  return (
    <>
      <Die x={20} y={26} pips={[[11, 11]]} />
      <Die x={50} y={26} pips={[[6, 6], [16, 16]]} />
      <text x={46} y={68} textAnchor="middle" fontSize={11} fill={F2}>
        бросок
      </text>
      <text x={46} y={82} textAnchor="middle" fontSize={11} fill={F2}>
        приоритета
      </text>
      <path d="M84 46h22" stroke={A} strokeWidth={2} markerEnd={`url(#${ids.accent})`} />
      {[
        [114, "Ход 1", A],
        [214, "Ход 2", W],
      ].map(([x, t, c]) => (
        <g key={t as string}>
          <rect x={x as number} y={24} width={90} height={56} rx={10} fill={PANEL} />
          <text x={(x as number) + 45} y={48} textAnchor="middle" fontSize={12} fontWeight={700} fill={c as string}>
            {t}
          </text>
          <text x={(x as number) + 45} y={66} textAnchor="middle" fontSize={10.5} fill={F2}>
            7 фаз
          </text>
        </g>
      ))}
      <Tag x={160} y={112} c={A}>
        Победитель решает, кто ходит первым
      </Tag>
    </>
  );
}

function AosPhases() {
  const names = ["Начало хода", "Фаза героев", "Движение", "Стрельба", "Нападение", "Бой", "Конец хода"];
  return (
    <>
      {names.map((name, i) => {
        const y = 20 + i * 21;
        return (
          <g key={name}>
            <rect x={20} y={y} width={280} height={18} rx={6} fill={PANEL} />
            <text x={34} y={y + 13} fontSize={11} fontWeight={800} fill={i > 0 && i < 6 ? A : F3}>
              {i + 1}
            </text>
            <text x={52} y={y + 13} fontSize={11.5} fill={W}>
              {name}
            </text>
          </g>
        );
      })}
    </>
  );
}

function AosWarscroll() {
  const vals: [string, number, number][] = [
    ["5″", 133, 58],
    ["2", 187, 58],
    ["4+", 133, 104],
    ["1", 187, 104],
  ];
  const labels: [string, number, number][] = [
    ["Move — движение", 60, 46],
    ["Health — здоровье", 262, 46],
    ["Save — спасбросок", 60, 112],
    ["Control — контроль", 262, 112],
  ];
  return (
    <>
      <circle cx={160} cy={76} r={54} fill={PANEL} stroke={A} strokeWidth={2} />
      <line x1={106} y1={76} x2={214} y2={76} stroke="rgba(255,255,255,.18)" />
      <line x1={160} y1={22} x2={160} y2={130} stroke="rgba(255,255,255,.18)" />
      {vals.map(([v, x, y]) => (
        <text key={`${x}-${y}`} x={x} y={y} textAnchor="middle" fontSize={18} fontWeight={800} fill={W}>
          {v}
        </text>
      ))}
      {labels.map(([t, x, y]) => (
        <text key={t} x={x} y={y} textAnchor="middle" fontSize={10.5} fill={F2}>
          {t}
        </text>
      ))}
      <text x={160} y={152} textAnchor="middle" fontSize={11} fill={F3}>
        Пример варскролла пехоты
      </text>
    </>
  );
}

function AosCommand() {
  return (
    <>
      {[0, 1, 2, 3, 4].map((i) => {
        const c = i < 4 ? A : W;
        return (
          <g key={i}>
            <circle cx={36 + i * 34} cy={44} r={13} fill="none" stroke={c} strokeWidth={2.4} strokeDasharray={i === 4 ? "3 3" : undefined} />
            <text x={36 + i * 34} y={48} textAnchor="middle" fontSize={10} fontWeight={800} fill={c}>
              CP
            </text>
          </g>
        );
      })}
      <text x={88} y={78} textAnchor="middle" fontSize={11} fill={F2}>
        4 CP каждому
      </text>
      <text x={172} y={78} textAnchor="middle" fontSize={11} fill={W}>
        +1 отстающему
      </text>
      <rect x={210} y={26} width={96} height={40} rx={10} fill={PANEL} />
      <text x={258} y={44} textAnchor="middle" fontSize={11} fontWeight={700} fill={A}>
        Rally
      </text>
      <text x={258} y={59} textAnchor="middle" fontSize={10} fill={F2}>
        6 кубиков, 4+
      </text>
      {[6, 2, 4, 5, 1, 4].map((v, i) => {
        const ok = v >= 4;
        const x = 40 + i * 40;
        return (
          <g key={i}>
            <rect x={x} y={100} width={26} height={26} rx={6} fill={ok ? LIGHT : "#3A3A36"} />
            <text x={x + 13} y={118} textAnchor="middle" fontSize={13} fontWeight={800} fill={ok ? "#141413" : F3}>
              {v}
            </text>
          </g>
        );
      })}
      <text x={160} y={148} textAnchor="middle" fontSize={11} fill={F2}>
        4 очка сбора: лечение или возврат моделей
      </text>
    </>
  );
}

const CombatRange = ({ x, y, r }: { x: number; y: number; r: number }) => (
  <circle cx={x} cy={y} r={r} fill="rgba(248,113,113,.07)" stroke={R} strokeDasharray="4 4" />
);

function AosMove({ ids }: { ids: Ids }) {
  return (
    <>
      <CombatRange x={270} y={128} r={40} />
      <Base x={270} y={128} c={R} />
      <text x={270} y={82} textAnchor="middle" fontSize={10.5} fill={R}>
        зона боя 3″
      </text>
      <Base x={40} y={46} />
      <line x1={56} y1={46} x2={186} y2={46} stroke={A} strokeWidth={2} markerEnd={`url(#${ids.accent})`} />
      <Tag x={120} y={28} c={A}>
        Обычный ход: до Move
      </Tag>
      <Ghost x={200} y={46} />
      <Base x={40} y={112} />
      <line x1={56} y1={112} x2={206} y2={112} stroke={A} strokeWidth={2} markerEnd={`url(#${ids.accent})`} />
      <Tag x={124} y={94} c={A}>
        Бег: Move + D6″
      </Tag>
      <text x={130} y={160} textAnchor="middle" fontSize={11} fill={F2}>
        в зону боя врага заходить нельзя
      </text>
    </>
  );
}

function AosShoot({ ids }: { ids: Ids }) {
  return (
    <>
      <Base x={36} y={56} />
      <Base x={286} y={56} r={14} c={R} />
      <line x1={52} y1={56} x2={270} y2={56} stroke={W} strokeWidth={1.6} markerEnd={`url(#${ids.white})`} />
      <Tag x={160} y={40}>
        Видит и в пределах Range
      </Tag>
      <Tick x={36} y1={70} y2={92} />
      <Tick x={286} y1={70} y2={92} />
      <Measure x1={36} x2={286} y={86} label="Range = 18″" marker={ids.white} />
      <CombatRange x={80} y={140} r={34} />
      <Base x={64} y={140} />
      <Base x={98} y={140} c={R} />
      <text x={210} y={136} textAnchor="middle" fontSize={11.5} fontWeight={700} fill={R}>
        В бою — не стреляет
      </text>
      <text x={210} y={152} textAnchor="middle" fontSize={10.5} fill={F2}>
        если нет Shoot in Combat
      </text>
    </>
  );
}

function AosCharge({ ids }: { ids: Ids }) {
  return (
    <>
      <Tag x={160} y={30} c={A}>
        Бросок 2D6 = 7″
      </Tag>
      <Base x={40} y={86} />
      <Base x={282} y={86} r={14} c={R} />
      <line x1={56} y1={86} x2={250} y2={86} stroke={A} strokeWidth={2} markerEnd={`url(#${ids.accent})`} />
      <Ghost x={256} y={86} />
      <Tag x={262} y={124} c={A}>
        ½″
      </Tag>
      <text x={130} y={124} textAnchor="middle" fontSize={11} fill={F2}>
        закончить в ½″ от видимого врага
      </text>
    </>
  );
}

function AosFight({ ids }: { ids: Ids }) {
  return (
    <>
      <CombatRange x={150} y={84} r={58} />
      <Base x={150} y={84} r={14} c={R} />
      <Base x={108} y={52} />
      <Base x={104} y={110} />
      <Base x={236} y={140} />
      <path d="M222 134 C200 124 186 116 172 104" fill="none" stroke={A} strokeWidth={1.8} markerEnd={`url(#${ids.accent})`} />
      <Tag x={250} y={164} c={A}>
        Подход до 3″
      </Tag>
      <text x={150} y={18} textAnchor="middle" fontSize={10.5} fill={R}>
        зона боя 3″
      </text>
      <text x={266} y={46} textAnchor="middle" fontSize={11} fill={F2}>
        игроки по очереди
      </text>
      <text x={266} y={62} textAnchor="middle" fontSize={11} fill={F2}>
        выбирают юнит
      </text>
    </>
  );
}

function AosAttack({ ids }: { ids: Ids }) {
  const cols = ["Atk", "Hit", "Wnd", "Rnd", "Dmg"];
  const vals = ["2", "3+", "3+", "1", "1"];
  const steps = [
    ["Попадание", "≥ Hit"],
    ["Ранение", "≥ Wnd"],
    ["Спасбросок", "− Rend"],
    ["Урон", "= Dmg"],
  ];
  return (
    <>
      {cols.map((c, i) => {
        const x = 10 + i * 61;
        return (
          <g key={c}>
            <rect x={x} y={20} width={57} height={22} rx={6} fill={HEAD} />
            <text x={x + 28.5} y={35} textAnchor="middle" fontSize={11} fontWeight={700} fill={W}>
              {c}
            </text>
            <rect x={x} y={46} width={57} height={24} rx={6} fill={LIGHT} />
            <text x={x + 28.5} y={63} textAnchor="middle" fontSize={13} fontWeight={800} fill="#141413">
              {vals[i]}
            </text>
          </g>
        );
      })}
      {steps.map(([t, s], i) => {
        const x = 10 + i * 78;
        return (
          <g key={t}>
            <rect x={x} y={86} width={70} height={56} rx={10} fill={PANEL} />
            <text x={x + 35} y={108} textAnchor="middle" fontSize={11} fontWeight={700} fill={W}>
              {t}
            </text>
            <text x={x + 35} y={126} textAnchor="middle" fontSize={10.5} fill={F2}>
              {s}
            </text>
            {i < 3 && <path d={`M${x + 71} 114h6`} stroke={A} strokeWidth={2} markerEnd={`url(#${ids.accent})`} />}
          </g>
        );
      })}
    </>
  );
}

function AosObjective() {
  return (
    <>
      <circle cx={160} cy={84} r={62} fill="none" stroke="rgba(232,184,74,.5)" strokeDasharray="4 4" />
      <circle cx={160} cy={84} r={16} fill={GOLD} opacity={0.9} />
      <text x={160} y={88} textAnchor="middle" fontSize={10} fontWeight={800} fill="#111">
        ОБ
      </text>
      <Base x={110} y={58} />
      <Base x={108} y={92} />
      <Base x={122} y={124} />
      <Base x={210} y={60} c={R} />
      <Base x={214} y={104} c={R} />
      <Tag x={60} y={160} c={A}>
        Control 3
      </Tag>
      <Tag x={262} y={160} c={R}>
        Control 2
      </Tag>
      <text x={160} y={16} textAnchor="middle" fontSize={10.5} fill={GOLD}>
        объект в зоне боя модели (3″)
      </text>
    </>
  );
}

/* ---------- Kill Team ---------- */
function KtDie({ x, y, v, ok = true, crit = false, size = 24 }: { x: number; y: number; v: string | number; ok?: boolean; crit?: boolean; size?: number }) {
  return (
    <g>
      <rect x={x} y={y} width={size} height={size} rx={6} fill={ok ? LIGHT : "#3A3A36"} stroke={crit ? A : undefined} strokeWidth={crit ? 2.5 : undefined} />
      <text x={x + size / 2} y={y + size / 2 + 5} textAnchor="middle" fontSize={13} fontWeight={800} fill={ok ? "#141413" : F3}>
        {v}
      </text>
    </g>
  );
}

function KtGame() {
  return (
    <>
      {[0, 1, 2, 3].map((i) => {
        const x = 12 + i * 76;
        return (
          <g key={i}>
            <rect x={x} y={26} width={70} height={92} rx={10} fill={PANEL} />
            <text x={x + 35} y={46} textAnchor="middle" fontSize={11.5} fontWeight={800} fill={A}>
              TP {i + 1}
            </text>
            <rect x={x + 6} y={56} width={58} height={22} rx={6} fill={HEAD} />
            <text x={x + 35} y={71} textAnchor="middle" fontSize={10} fill={W}>
              Стратегия
            </text>
            <rect x={x + 6} y={84} width={58} height={22} rx={6} fill="rgba(236,254,70,.18)" />
            <text x={x + 35} y={99} textAnchor="middle" fontSize={10} fill={A}>
              Перестрелка
            </text>
          </g>
        );
      })}
      <text x={160} y={146} textAnchor="middle" fontSize={11} fill={F2}>
        4 переломных момента (Turning Points)
      </text>
    </>
  );
}

function KtCard() {
  const stats = [
    ["APL", "2"],
    ["Move", "6″"],
    ["Save", "3+"],
    ["Wounds", "8"],
  ];
  const weapon = [
    ["Atk", "4"],
    ["Hit", "3+"],
    ["Dmg", "3/4"],
  ];
  return (
    <>
      {stats.map(([k, v], i) => {
        const x = 14 + i * 76;
        return (
          <g key={k}>
            <text x={x + 34} y={36} textAnchor="middle" fontSize={11.5} fontWeight={700} fill={F2}>
              {k}
            </text>
            <rect x={x} y={44} width={68} height={40} rx={9} fill={LIGHT} />
            <text x={x + 34} y={71} textAnchor="middle" fontSize={18} fontWeight={800} fill="#141413">
              {v}
            </text>
          </g>
        );
      })}
      {weapon.map(([k, v], i) => {
        const x = 14 + i * 100;
        return (
          <g key={k}>
            <rect x={x} y={100} width={92} height={20} rx={6} fill={HEAD} />
            <text x={x + 46} y={114} textAnchor="middle" fontSize={11} fontWeight={700} fill={W}>
              {k}
            </text>
            <rect x={x} y={122} width={92} height={22} rx={6} fill={PANEL} />
            <text x={x + 46} y={138} textAnchor="middle" fontSize={13} fontWeight={800} fill={A}>
              {v}
            </text>
          </g>
        );
      })}
      <text x={160} y={164} textAnchor="middle" fontSize={11} fill={F3}>
        Пример: Dmg 3/4 — обычный / критический урон
      </text>
    </>
  );
}

function KtStrategy() {
  return (
    <>
      <KtDie x={40} y={30} v={5} />
      <KtDie x={70} y={30} v={3} ok={false} />
      <text x={66} y={76} textAnchor="middle" fontSize={11} fill={F2}>
        D6 против D6
      </text>
      <Tag x={66} y={98} c={A}>
        Инициатива
      </Tag>
      <rect x={150} y={24} width={156} height={92} rx={12} fill={PANEL} />
      <text x={228} y={44} textAnchor="middle" fontSize={11.5} fontWeight={700} fill={W}>
        Очки команд (CP)
      </text>
      <text x={162} y={68} fontSize={11} fill={F2}>
        с инициативой
      </text>
      <text x={296} y={68} textAnchor="end" fontSize={13} fontWeight={800} fill={A}>
        +1
      </text>
      <text x={162} y={92} fontSize={11} fill={F2}>
        без инициативы
      </text>
      <text x={296} y={92} textAnchor="end" fontSize={13} fontWeight={800} fill={A}>
        +2
      </text>
      <text x={160} y={146} textAnchor="middle" fontSize={11} fill={F3}>
        Старт — 2 CP, в 1-й фазе стратегии +1 каждому
      </text>
    </>
  );
}

function KtFirefight() {
  const seq: [boolean, number][] = [
    [true, 2],
    [false, 2],
    [true, 3],
    [false, 2],
    [true, 2],
  ];
  return (
    <>
      {seq.map(([mine, apl], i) => {
        const x = 14 + i * 60;
        const c = mine ? A : R;
        return (
          <g key={i}>
            <rect x={x} y={30} width={52} height={64} rx={10} fill={PANEL} stroke={c} strokeWidth={1.5} />
            <text x={x + 26} y={54} textAnchor="middle" fontSize={12} fontWeight={800} fill={c}>
              {mine ? "Вы" : "Враг"}
            </text>
            {Array.from({ length: apl }, (_, k) => (
              <circle key={k} cx={x + 26 - (apl - 1) * 7 + k * 14} cy={76} r={5} fill={c} />
            ))}
            {i < 4 && <path d={`M${x + 53} 62h6`} stroke={W} strokeWidth={1.5} />}
          </g>
        );
      })}
      <text x={160} y={118} textAnchor="middle" fontSize={11} fill={F2}>
        точки — очки действий (AP), не больше APL
      </text>
      <Tag x={160} y={146}>
        Активировал — оперативник «отработан»
      </Tag>
    </>
  );
}

function KtOrders() {
  return (
    <>
      <rect x={20} y={24} width={130} height={96} rx={12} fill={PANEL} />
      <polygon points="85,38 103,56 85,74 67,56" fill={A} />
      <text x={85} y={96} textAnchor="middle" fontSize={12.5} fontWeight={800} fill={A}>
        Engage
      </text>
      <text x={85} y={112} textAnchor="middle" fontSize={10.5} fill={F2}>
        атака и контрдействие
      </text>
      <rect x={170} y={24} width={130} height={96} rx={12} fill={PANEL} />
      <polygon points="235,38 253,56 235,74 217,56" fill="none" stroke={W} strokeWidth={2.5} />
      <text x={235} y={96} textAnchor="middle" fontSize={12.5} fontWeight={800} fill={W}>
        Conceal
      </text>
      <text x={235} y={112} textAnchor="middle" fontSize={10.5} fill={F2}>
        скрыт в укрытии
      </text>
      <text x={160} y={146} textAnchor="middle" fontSize={11} fill={F3}>
        Приказ выбирают при каждой активации
      </text>
    </>
  );
}

function KtMove({ ids }: { ids: Ids }) {
  return (
    <>
      <Base x={36} y={40} />
      <line x1={52} y1={40} x2={176} y2={40} stroke={A} strokeWidth={2} markerEnd={`url(#${ids.accent})`} />
      <Tag x={112} y={22} c={A}>
        Reposition 1AP: до Move
      </Tag>
      <Base x={36} y={86} />
      <line x1={52} y1={86} x2={96} y2={86} stroke={A} strokeWidth={2} markerEnd={`url(#${ids.accent})`} />
      <Tag x={150} y={86} c={A}>
        Dash 1AP: до 3″
      </Tag>
      <CombatRange x={270} y={132} r={26} />
      <Base x={270} y={132} c={R} />
      <Base x={36} y={132} />
      <line x1={52} y1={132} x2={230} y2={132} stroke={A} strokeWidth={2} markerEnd={`url(#${ids.accent})`} />
      <Tag x={140} y={114} c={A}>
        Charge 1AP: Move + 2″
      </Tag>
      <text x={270} y={172} textAnchor="middle" fontSize={10.5} fill={R}>
        дистанция контроля 1″
      </text>
    </>
  );
}

function KtCover() {
  return (
    <>
      <Base x={36} y={70} />
      <Base x={286} y={70} c={R} />
      <path d="M248 48v44h12V48z" fill="#3A3A36" stroke="#5A5A54" strokeWidth={1.5} />
      <circle cx={286} cy={70} r={26} fill="none" stroke={R} strokeDasharray="3 3" />
      <line x1={52} y1={70} x2={244} y2={70} stroke={W} strokeWidth={1.6} strokeDasharray="5 4" />
      <Tag x={150} y={52}>
        Видит, но цель в укрытии
      </Tag>
      <text x={286} y={112} textAnchor="middle" fontSize={10.5} fill={F2}>
        террейн в 1″
      </text>
      <KtDie x={60} y={124} v="✓" size={26} />
      <KtDie x={92} y={124} v="?" ok={false} size={26} />
      <KtDie x={124} y={124} v="?" ok={false} size={26} />
      <text x={166} y={141} fontSize={11} fill={F2}>
        1 кубик — сразу успех
      </text>
    </>
  );
}

function KtShoot() {
  return (
    <>
      <text x={14} y={30} fontSize={11} fontWeight={700} fill={A}>
        Атака: Atk 4, Hit 3+
      </text>
      <KtDie x={14} y={40} v={6} crit />
      <KtDie x={46} y={40} v={4} />
      <KtDie x={78} y={40} v={3} />
      <KtDie x={110} y={40} v={1} ok={false} />
      <text x={170} y={30} fontSize={11} fontWeight={700} fill={R}>
        Защита: 3 кубика, Save 4+
      </text>
      <KtDie x={170} y={40} v={5} />
      <KtDie x={202} y={40} v={2} ok={false} />
      <KtDie x={234} y={40} v={6} crit />
      <text x={14} y={94} fontSize={11} fill={F2}>
        <tspan fill={A} fontWeight={700}>
          6
        </tspan>{" "}
        — критический успех,{" "}
        <tspan fill={W} fontWeight={700}>
          1
        </tspan>{" "}
        — всегда провал
      </text>
      <text x={14} y={114} fontSize={11} fill={F2}>
        Обычный блок снимает обычный успех
      </text>
      <text x={14} y={132} fontSize={11} fill={F2}>
        Критический блок — любой; 2 обычных — критический
      </text>
      <Tag x={160} y={154} c={A}>
        Осталось 1 попадание → урон Dmg
      </Tag>
    </>
  );
}

function KtFight() {
  const seq: [string, string, string][] = [
    ["Вы", "удар", A],
    ["Враг", "блок", R],
    ["Вы", "удар", A],
    ["Враг", "удар", R],
  ];
  return (
    <>
      <circle cx={130} cy={60} r={27} fill="none" stroke={A} strokeDasharray="3 3" opacity={0.6} />
      <Base x={130} y={60} />
      <Base x={170} y={60} c={R} />
      <Tag x={150} y={22}>
        Враг в 1″ — бой
      </Tag>
      {seq.map(([p, a, c], i) => {
        const x = 14 + i * 76;
        return (
          <g key={i}>
            <rect x={x} y={100} width={68} height={42} rx={9} fill={PANEL} stroke={c} strokeWidth={1.2} />
            <text x={x + 34} y={117} textAnchor="middle" fontSize={11} fontWeight={700} fill={c}>
              {p}
            </text>
            <text x={x + 34} y={133} textAnchor="middle" fontSize={10.5} fill={F2}>
              {a}
            </text>
          </g>
        );
      })}
      <text x={160} y={162} textAnchor="middle" fontSize={11} fill={F3}>
        по одному кубику по очереди, начиная с атакующего
      </text>
    </>
  );
}

function KtObjective() {
  const ops: [number, number, string, string][] = [
    [124, 62, "2", A],
    [126, 104, "2", A],
    [198, 80, "3", R],
  ];
  return (
    <>
      <circle cx={160} cy={80} r={46} fill="none" stroke="rgba(232,184,74,.5)" strokeDasharray="4 4" />
      <circle cx={160} cy={80} r={16} fill={GOLD} opacity={0.9} />
      {ops.map(([x, y, apl, c]) => (
        <g key={`${x}-${y}`}>
          <Base x={x} y={y} c={c} />
          <text x={x} y={y + 4} textAnchor="middle" fontSize={10} fontWeight={800} fill={c}>
            {apl}
          </text>
        </g>
      ))}
      <Tag x={60} y={150} c={A}>
        APL 2 + 2 = 4
      </Tag>
      <Tag x={260} y={150} c={R}>
        APL 3
      </Tag>
      <text x={160} y={20} textAnchor="middle" fontSize={10.5} fill={GOLD}>
        объект в 1″ от оперативника
      </text>
    </>
  );
}

/* ---------- Warcry ---------- */
function WcRound({ ids }: { ids: Ids }) {
  const phases = [
    ["Инициатива", "6 кубиков"],
    ["Резерв", "со 2-го раунда"],
    ["Бой", "активации"],
  ];
  return (
    <>
      {phases.map(([t, s], i) => {
        const x = 12 + i * 102;
        return (
          <g key={t}>
            <rect x={x} y={34} width={94} height={66} rx={10} fill={PANEL} />
            <circle cx={x + 16} cy={50} r={10} fill={A} />
            <text x={x + 16} y={54} textAnchor="middle" fontSize={11} fontWeight={800} fill="#111">
              {i + 1}
            </text>
            <text x={x + 47} y={76} textAnchor="middle" fontSize={12} fontWeight={700} fill={W}>
              {t}
            </text>
            <text x={x + 47} y={92} textAnchor="middle" fontSize={10.5} fill={F2}>
              {s}
            </text>
            {i < 2 && <path d={`M${x + 95} 67h6`} stroke={A} strokeWidth={2} markerEnd={`url(#${ids.accent})`} />}
          </g>
        );
      })}
      <text x={160} y={128} textAnchor="middle" fontSize={11} fill={F2}>
        Число раундов задаёт условие победы
      </text>
    </>
  );
}

function WcCard() {
  const stats = [
    ["Move", "4″"],
    ["Tough.", "4"],
    ["Wounds", "15"],
  ];
  const weapon = [
    ["Range", "1"],
    ["Attacks", "3"],
    ["Strength", "4"],
    ["Damage", "1/3"],
  ];
  return (
    <>
      {stats.map(([k, v], i) => {
        const x = 14 + i * 100;
        return (
          <g key={k}>
            <text x={x + 46} y={34} textAnchor="middle" fontSize={11.5} fontWeight={700} fill={F2}>
              {k}
            </text>
            <rect x={x} y={42} width={92} height={38} rx={9} fill={LIGHT} />
            <text x={x + 46} y={68} textAnchor="middle" fontSize={18} fontWeight={800} fill="#141413">
              {v}
            </text>
          </g>
        );
      })}
      {weapon.map(([k, v], i) => {
        const x = 14 + i * 75;
        return (
          <g key={k}>
            <rect x={x} y={96} width={69} height={20} rx={6} fill={HEAD} />
            <text x={x + 34.5} y={110} textAnchor="middle" fontSize={10.5} fontWeight={700} fill={W}>
              {k}
            </text>
            <rect x={x} y={118} width={69} height={22} rx={6} fill={PANEL} />
            <text x={x + 34.5} y={134} textAnchor="middle" fontSize={13} fontWeight={800} fill={A}>
              {v}
            </text>
          </g>
        );
      })}
      <text x={160} y={160} textAnchor="middle" fontSize={11} fill={F3}>
        Пример · Damage 1/3 — обычное / критическое
      </text>
    </>
  );
}

function WcInitiative() {
  const roll: [number, boolean][] = [
    [1, true],
    [3, true],
    [5, true],
    [6, true],
    [4, false],
    [4, false],
  ];
  return (
    <>
      <text x={14} y={28} fontSize={11} fontWeight={700} fill={W}>
        Бросок 6 кубиков
      </text>
      {roll.map(([v, single], i) => (
        <KtDie key={i} x={14 + i * 34} y={38} v={v} crit={single} size={26} />
      ))}
      <text x={14} y={88} fontSize={11} fontWeight={700} fill={A}>
        4 одиночных (singles)
      </text>
      <text x={180} y={88} fontSize={11} fill={F2}>
        дубль 4–4
      </text>
      <rect x={232} y={34} width={72} height={34} rx={8} fill={PANEL} />
      <text x={268} y={49} textAnchor="middle" fontSize={10} fill={F2}>
        у соперника
      </text>
      <text x={268} y={62} textAnchor="middle" fontSize={11} fontWeight={800} fill={R}>
        3 одиночных
      </text>
      <Tag x={160} y={122} c={A}>
        Больше одиночных — ваша инициатива
      </Tag>
    </>
  );
}

function WcAbilities() {
  const rows: [string, number, string][] = [
    ["Дубль", 2, "Рывок (+1″ Move), Передышка (лечение)"],
    ["Тройка", 3, "Натиск (+1 атака), Вдохновение"],
    ["Четвёрка", 4, "Расплата: ход и атака при потерях"],
  ];
  return (
    <>
      {rows.map(([t, k, s], i) => {
        const y = 22 + i * 42;
        return (
          <g key={t}>
            {Array.from({ length: k }, (_, j) => (
              <rect key={j} x={14 + j * 18} y={y} width={16} height={16} rx={4} fill={LIGHT} />
            ))}
            <text x={96} y={y + 8} fontSize={12} fontWeight={700} fill={W}>
              {t}
            </text>
            <text x={96} y={y + 24} fontSize={10.5} fill={F2}>
              {s}
            </text>
          </g>
        );
      })}
      <rect x={14} y={150} width={16} height={16} rx={4} fill="none" stroke={A} strokeWidth={2} />
      <text x={38} y={162} fontSize={11} fill={A}>
        дикий кубик (wild) — дополнит любую группу
      </text>
    </>
  );
}

function WcCombat() {
  return (
    <>
      {[true, false, true, false].map((mine, i) => {
        const x = 14 + i * 76;
        const c = mine ? A : R;
        return (
          <g key={i}>
            <rect x={x} y={28} width={68} height={60} rx={10} fill={PANEL} stroke={c} strokeWidth={1.5} />
            <text x={x + 34} y={52} textAnchor="middle" fontSize={12} fontWeight={800} fill={c}>
              {mine ? "Вы" : "Враг"}
            </text>
            <circle cx={x + 27} cy={70} r={5} fill={c} />
            <circle cx={x + 41} cy={70} r={5} fill={c} />
          </g>
        );
      })}
      <text x={160} y={112} textAnchor="middle" fontSize={11} fill={F2}>
        по 2 действия за активацию
      </text>
      <Tag x={160} y={140}>
        Боец активируется один раз за фазу
      </Tag>
    </>
  );
}

function WcActions({ ids }: { ids: Ids }) {
  return (
    <>
      <Base x={36} y={40} />
      <line x1={52} y1={40} x2={176} y2={40} stroke={A} strokeWidth={2} markerEnd={`url(#${ids.accent})`} />
      <Tag x={112} y={22} c={A}>
        Move: до Move
      </Tag>
      <CombatRange x={60} y={112} r={26} />
      <Base x={60} y={112} c={R} />
      <Base x={96} y={112} />
      <line x1={110} y1={112} x2={190} y2={112} stroke={A} strokeWidth={2} markerEnd={`url(#${ids.accent})`} />
      <Tag x={150} y={94} c={A}>
        Disengage: до 3″
      </Tag>
      <text x={60} y={156} textAnchor="middle" fontSize={10.5} fill={R}>
        в 1″ от врага
      </text>
      <rect x={212} y={58} width={96} height={70} rx={10} fill={PANEL} />
      <text x={260} y={80} textAnchor="middle" fontSize={11.5} fontWeight={700} fill={W}>
        Attack
      </text>
      <text x={260} y={98} textAnchor="middle" fontSize={11.5} fontWeight={700} fill={W}>
        Wait
      </text>
      <text x={260} y={116} textAnchor="middle" fontSize={10} fill={F2}>
        атака · ожидание
      </text>
    </>
  );
}

function WcAttack() {
  const rows = [
    ["S больше T", "3+"],
    ["S = T", "4+"],
    ["S меньше T", "5+"],
  ];
  return (
    <>
      {rows.map(([k, v], i) => {
        const x = 10 + i * 102;
        return (
          <g key={k}>
            <rect x={x} y={24} width={96} height={22} rx={6} fill={HEAD} />
            <text x={x + 48} y={39} textAnchor="middle" fontSize={11} fontWeight={700} fill={W}>
              {k}
            </text>
            <rect x={x} y={48} width={96} height={24} rx={6} fill={LIGHT} />
            <text x={x + 48} y={65} textAnchor="middle" fontSize={13} fontWeight={800} fill="#141413">
              попадание {v}
            </text>
          </g>
        );
      })}
      <text x={14} y={96} fontSize={11} fill={F2}>
        Пример: Attacks 3, S 4 против T 4, Damage 1/3
      </text>
      <KtDie x={14} y={106} v={6} crit />
      <KtDie x={46} y={106} v={4} />
      <KtDie x={78} y={106} v={2} ok={false} />
      <text x={120} y={123} fontSize={11.5} fill={W}>
        3 + 1 ={" "}
        <tspan fill={A} fontWeight={800}>
          4 урона
        </tspan>
      </text>
      <text x={160} y={156} textAnchor="middle" fontSize={11} fill={F3}>
        6 — критическое: урон по второму числу
      </text>
    </>
  );
}

const HEIGHT: Record<TutorialDiagram, number> = {
  round: 200,
  profile: 160,
  command: 172,
  move: 170,
  weapon: 166,
  sight: 180,
  attack: 170,
  charge: 162,
  fight: 174,
  ready: 150,
  aosRound: 130,
  aosPhases: 176,
  aosWarscroll: 166,
  aosCommand: 162,
  aosMove: 170,
  aosShoot: 170,
  aosCharge: 140,
  aosFight: 176,
  aosAttack: 152,
  aosObjective: 176,
  ktGame: 160,
  ktCard: 176,
  ktStrategy: 160,
  ktFirefight: 160,
  ktOrders: 160,
  ktMove: 182,
  ktCover: 166,
  ktShoot: 168,
  ktFight: 172,
  ktObjective: 166,
  wcRound: 144,
  wcCard: 172,
  wcInitiative: 140,
  wcAbilities: 176,
  wcCombat: 156,
  wcActions: 168,
  wcAttack: 168,
};

const ALT: Record<TutorialDiagram, string> = {
  round: "Схема: пять фаз хода по кругу",
  profile: "Схема: характеристики юнита M, T, Sv, W, Ld, OC",
  command: "Схема: +1 CP и проверка боевого шока 2D6",
  move: "Схема: обычный ход на M дюймов и рывок M + D6",
  weapon: "Схема: профиль оружия",
  sight: "Схема: модель видит цель на 24 дюйма; стена закрывает обзор",
  attack: "Схема: четыре шага атаки и таблица ранения",
  charge: "Схема: бросок 2D6 = 8, до одного врага 9 дюймов, до другого 8",
  fight: "Схема: сближение до 3 дюймов и атаки в 2 дюймах",
  ready: "Что сделать перед первой игрой",
  aosRound: "Схема: бросок приоритета и два хода по 7 фаз",
  aosPhases: "Схема: семь фаз хода",
  aosWarscroll: "Схема: характеристики варскролла Move, Health, Save, Control",
  aosCommand: "Схема: 4 очка команд, +1 отстающему, команда Rally",
  aosMove: "Схема: обычный ход, бег и зона боя врага 3 дюйма",
  aosShoot: "Схема: стрельба на дальность оружия; юнит в бою не стреляет",
  aosCharge: "Схема: бросок 2D6 и конец нападения в полудюйме от врага",
  aosFight: "Схема: зона боя 3 дюйма и подход до 3 дюймов",
  aosAttack: "Схема: профиль оружия и четыре шага атаки",
  aosObjective: "Схема: контроль объекта, сумма Control 3 против 2",
  ktGame: "Схема: 4 переломных момента, в каждом фаза стратегии и перестрелки",
  ktCard: "Схема: пример датакарты APL, Move, Save, Wounds и оружия Atk, Hit, Dmg",
  ktStrategy: "Схема: бросок инициативы и очки команд",
  ktFirefight: "Схема: игроки по очереди активируют оперативников",
  ktOrders: "Схема: приказы Engage и Conceal",
  ktMove: "Схема: Reposition, Dash и Charge, дистанция контроля 1 дюйм",
  ktCover: "Схема: цель в укрытии, один кубик защиты сразу успех",
  ktShoot: "Схема: кубики атаки против трёх кубиков защиты",
  ktFight: "Схема: в ближнем бою игроки по очереди бьют или блокируют",
  ktObjective: "Схема: контроль объекта по сумме APL, 4 против 3",
  wcRound: "Схема: три фазы раунда — инициатива, резерв, бой",
  wcCard: "Схема: пример карточки бойца и оружия",
  wcInitiative: "Схема: шесть кубиков инициативы, одиночные и дубль",
  wcAbilities: "Схема: дубль, тройка, четвёрка и дикий кубик",
  wcCombat: "Схема: игроки по очереди активируют бойцов, по 2 действия",
  wcActions: "Схема: Move, Disengage до 3 дюймов, Attack и Wait",
  wcAttack: "Схема: попадание по силе и стойкости, пример урона",
};

export default function TutorialDiagramView({ diagram }: { diagram: TutorialDiagram }) {
  const uid = useId().replace(/:/g, "");
  const ids: Ids = { white: `${uid}w`, accent: `${uid}a`, red: `${uid}r`, dots: `${uid}d` };
  const h = HEIGHT[diagram];
  const body: Record<TutorialDiagram, ReactNode> = {
    round: <Round />,
    profile: <Profile />,
    command: <Command />,
    move: <Move ids={ids} />,
    weapon: <Weapon />,
    sight: <Sight ids={ids} />,
    attack: <Attack ids={ids} />,
    charge: <Charge ids={ids} />,
    fight: <Fight ids={ids} />,
    ready: <Ready />,
    aosRound: <AosRound ids={ids} />,
    aosPhases: <AosPhases />,
    aosWarscroll: <AosWarscroll />,
    aosCommand: <AosCommand />,
    aosMove: <AosMove ids={ids} />,
    aosShoot: <AosShoot ids={ids} />,
    aosCharge: <AosCharge ids={ids} />,
    aosFight: <AosFight ids={ids} />,
    aosAttack: <AosAttack ids={ids} />,
    aosObjective: <AosObjective />,
    ktGame: <KtGame />,
    ktCard: <KtCard />,
    ktStrategy: <KtStrategy />,
    ktFirefight: <KtFirefight />,
    ktOrders: <KtOrders />,
    ktMove: <KtMove ids={ids} />,
    ktCover: <KtCover />,
    ktShoot: <KtShoot />,
    ktFight: <KtFight />,
    ktObjective: <KtObjective />,
    wcRound: <WcRound ids={ids} />,
    wcCard: <WcCard />,
    wcInitiative: <WcInitiative />,
    wcAbilities: <WcAbilities />,
    wcCombat: <WcCombat />,
    wcActions: <WcActions ids={ids} />,
    wcAttack: <WcAttack />,
  };
  const marker = (id: string, fill: string) => (
    <marker id={id} viewBox="0 0 10 10" refX={9} refY={5} markerWidth={7} markerHeight={7} orient="auto-start-reverse">
      <path d="M0 0L10 5L0 10z" fill={fill} />
    </marker>
  );
  return (
    <svg viewBox={`0 0 320 ${h}`} role="img" aria-label={ALT[diagram]} className="block h-auto w-full rounded-[14px] bg-[#22221F]">
      <defs>
        {marker(ids.white, W)}
        {marker(ids.accent, A)}
        {marker(ids.red, R)}
        <pattern id={ids.dots} width={16} height={16} patternUnits="userSpaceOnUse">
          <circle cx={2} cy={2} r={1} fill="rgba(255,255,255,.07)" />
        </pattern>
      </defs>
      <rect width={320} height={h} fill={`url(#${ids.dots})`} />
      {body[diagram]}
    </svg>
  );
}
