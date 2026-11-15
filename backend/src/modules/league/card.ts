/** Карточка результата партии лиги (этап 3b, 15.11.2026): данные для рисовальщика карточек уведомлений. */
import type { NotificationCard } from '../notifications/card/parse';
import { seasonLabel } from './elo';

const SHORT: Record<string, string> = { 'Warhammer 40,000': 'Warhammer 40K', 'Age of Sigmar': 'Age of Sigmar', 'Kill Team': 'Kill Team', Warcry: 'Warcry' };

export function buildResultCard(p: {
  result: 'win' | 'loss' | 'draw';
  gameLabel: string;
  when: string;
  opponent: string;
  season: string;
  rating: { rating: number; delta: number } | null;
}): NotificationCard {
  return {
    // на картинке тесно (проверено по образцу в CI): сезон — в надзаголовке, игра — коротко, дата без времени
    kicker: `${p.result === 'win' ? 'Победа' : p.result === 'draw' ? 'Ничья' : 'Лига'} · ${seasonLabel(p.season).split(' · ')[0]!}`,
    title: SHORT[p.gameLabel] ?? p.gameLabel,
    subtitle: '',
    tone: p.result === 'win' ? 'accent' : 'neutral',
    blocks: [
      {
        type: 'rows',
        rows: [
          { label: 'Когда', value: p.when },
          { label: 'Соперник', value: p.opponent },
          ...(p.rating ? [{ label: 'Рейтинг', value: `${p.rating.rating} (${p.rating.delta >= 0 ? '+' : ''}${p.rating.delta})` }] : []),
        ],
      },
    ],
    note: '',
  };
}
