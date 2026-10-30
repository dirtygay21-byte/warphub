import { useMemo, useState } from 'react';
import type { AosComputed, AosLookup } from '../../aos/engine';
import { exportAos, exportAosCompact } from '../../aos/export';
import { encodeAosRoster } from '../../aos/roster';
import type { AosRoster } from '../../aos/types';
import { haptic, shareText } from '../../telegram';
import { Button, Icon, Segmented, Sheet } from '../kit';

type Fmt = 'list' | 'compact' | 'code';

export function AosExportSheet({ open, onClose, roster, L, cr }: { open: boolean; onClose: () => void; roster: AosRoster; L: AosLookup; cr: AosComputed }) {
  const [fmt, setFmt] = useState<Fmt>('list');
  const [copied, setCopied] = useState(false);
  const text = useMemo(() => {
    if (!open) return '';
    if (fmt === 'list') return exportAos(roster, L);
    if (fmt === 'compact') return exportAosCompact(roster, L);
    return encodeAosRoster(roster);
  }, [open, fmt, roster, L]);

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
      title="Экспорт"
      tall
      footer={
        <div className="flex gap-2">
          <Button variant="primary" className="h-12 flex-1" onClick={copy}>
            <Icon name={copied ? 'check' : 'copy'} /> {copied ? 'Скопировано' : 'Скопировать'}
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
          { value: 'list', label: 'Список AoS' },
          { value: 'compact', label: 'Коротко' },
          { value: 'code', label: 'Код' },
        ]}
      />
      {cr.errors > 0 && fmt !== 'code' && (
        <p className="mb-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] text-red-200">В ростере есть ошибки ({cr.errors}) — список не пройдёт проверку.</p>
      )}
      {fmt === 'code' && <p className="mb-3 text-sm text-fg-3">Код целиком содержит ростер — вставьте его в «Импорт по коду» (вкладка Age of Sigmar) на другом устройстве.</p>}
      <pre className="whitespace-pre-wrap break-words rounded-xl border border-white/10 bg-black/30 p-3 font-mono text-[12px] leading-relaxed text-white/85">{text}</pre>
    </Sheet>
  );
}
