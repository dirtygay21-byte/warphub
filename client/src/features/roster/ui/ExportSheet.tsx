import { useMemo, useState } from 'react';
import type { ComputedRoster, DataLookup } from '../engine/compute';
import { exportCompact, exportGw } from '../engine/export';
import { encodeRoster } from '../engine/roster';
import type { Roster } from '../engine/types';
import { haptic, shareText } from '../telegram';
import { Button, Icon, Segmented, Sheet } from './kit';
import { useT } from './common/i18n';

type Fmt = 'gw' | 'compact' | 'code';

export function ExportSheet({ open, onClose, roster, L, cr, dataVersion, credit = null }: { open: boolean; onClose: () => void; roster: Roster; L: DataLookup; cr: ComputedRoster; dataVersion: string | null; credit?: string | null }) {
  const t = useT();
  const [fmt, setFmt] = useState<Fmt>('gw');
  const [copied, setCopied] = useState(false);
  const text = useMemo(() => {
    if (!open) return '';
    if (fmt === 'gw') return exportGw(roster, L, cr, dataVersion, credit);
    if (fmt === 'compact') return exportCompact(roster, L, cr);
    return encodeRoster(roster);
  }, [open, fmt, roster, L, cr, dataVersion, credit]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    haptic.ok();
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('Экспорт', 'Export')}
      tall
      footer={
        <div className="flex gap-2">
          <Button variant="primary" className="h-12 flex-1" onClick={copy}>
            <Icon name={copied ? 'check' : 'copy'} /> {copied ? t('Скопировано', 'Copied') : t('Скопировать', 'Copy')}
          </Button>
          {fmt !== 'code' && (
            <Button variant="ghost" className="h-12" onClick={() => shareText(text)}>
              <Icon name="share" /> Telegram
            </Button>
          )}
        </div>
      }
    >
      <Segmented
        value={fmt}
        onChange={setFmt}
        className="mb-3"
        options={[
          { value: 'gw', label: t('Как в приложении GW', 'GW app format') },
          { value: 'compact', label: t('Коротко', 'Compact') },
          { value: 'code', label: t('Код', 'Code') },
        ]}
      />
      {cr.errors > 0 && fmt !== 'code' && (
        <p className="mb-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] text-red-200">{t(`В ростере есть ошибки (${cr.errors}) — список не пройдёт проверку.`, `The roster has errors (${cr.errors}) — the list will not pass validation.`)}</p>
      )}
      {fmt === 'code' && <p className="mb-3 text-sm text-fg-3">{t('Код целиком содержит ростер — вставьте его в «Импорт по коду» на другом устройстве.', 'The code contains the whole roster — paste it into “Import by code” on another device.')}</p>}
      <pre className="whitespace-pre-wrap break-words rounded-xl border border-white/10 bg-black/30 p-3 font-mono text-[12px] leading-relaxed text-white/85">{text}</pre>
    </Sheet>
  );
}
