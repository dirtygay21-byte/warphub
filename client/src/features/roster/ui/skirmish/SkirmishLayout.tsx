export { SetupStep as SkirmishStep } from '../common/SetupStep';

const LABELS = ['MISSION ACTION', 'ADDITIONAL RULES', 'VICTORY POINTS', 'REVEAL'] as const;

/** Нормализованный текст правила: смысловые заголовки отделены, служебные Unicode-символы не показываются. */
export function SkirmishRuleText({ text }: { text: string }) {
  const clean = text.replace(/\u200b|\u200c|\u200d|\ufeff/g, '').replace(/\s+/g, ' ').trim();
  const marker = new RegExp(`\\b(${LABELS.join('|')})\\b`, 'g');
  const parts = clean.split(marker);
  return (
    <div className="space-y-1.5">
      {parts.map((part, i) => LABELS.includes(part as (typeof LABELS)[number]) ? (
        <p key={i} className="pt-1 text-[11px] font-bold uppercase tracking-[0.08em] text-accent/90">{part}</p>
      ) : (
        <p key={i} className="text-[12.5px] leading-relaxed text-fg-2">{part}</p>
      ))}
    </div>
  );
}
