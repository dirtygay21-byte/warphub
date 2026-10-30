import type { ReactNode } from 'react';

/** **жирный** внутри строки (без HTML: текст источника не исполняется). */
function inline(s: string): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : p));
}

/**
 * Текст правила Kill Team (Markdown ktdash): абзацы, списки «- » с вложенностью, таблицы «|…|», **жирный**.
 * Только эти конструкции; остальное — как текст.
 */
export function Md({ text, className }: { text: string; className?: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r/g, '').split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.trim().startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i]!.trim().startsWith('|')) {
        const cells = lines[i]!.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        if (!cells.every((c) => /^:?-+:?$/.test(c))) rows.push(cells);
        i++;
      }
      blocks.push(
        <div key={blocks.length} className="my-1.5 overflow-x-auto">
          <table className="w-full text-[11.5px] tabular-nums">
            <tbody>
              {rows.map((r, j) => (
                <tr key={j} className={j === 0 ? 'text-white/55' : 'text-white/80'}>
                  {r.map((c, k) => (
                    <td key={k} className="border-b border-white/5 px-1 py-0.5">
                      {inline(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^\s*[-•]\s/.test(line)) {
      const items: { depth: number; text: string }[] = [];
      while (i < lines.length && /^\s*[-•]\s/.test(lines[i]!)) {
        const m = lines[i]!.match(/^(\s*)[-•]\s+(.*)$/)!;
        items.push({ depth: Math.min(3, Math.floor(m[1]!.length / 2)), text: m[2]! });
        i++;
      }
      blocks.push(
        <ul key={blocks.length} className="my-1 space-y-0.5">
          {items.map((it, j) => (
            <li key={j} className="flex gap-1.5" style={{ paddingLeft: it.depth * 12 }}>
              <span className="text-white/35">•</span>
              <span className="min-w-0 flex-1">{inline(it.text)}</span>
            </li>
          ))}
        </ul>,
      );
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !lines[i]!.trim().startsWith('|') && !/^\s*[-•]\s/.test(lines[i]!)) para.push(lines[i++]!.trim());
    blocks.push(
      <p key={blocks.length} className="my-1">
        {inline(para.join(' '))}
      </p>,
    );
  }
  return <div className={className ?? 'text-[12.5px] leading-snug text-white/75'}>{blocks}</div>;
}
