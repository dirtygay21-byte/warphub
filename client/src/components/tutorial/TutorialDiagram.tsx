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
