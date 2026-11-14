/**
 * Фоновая работа уведомлений (14.11.2026): очередь — каждые 15 с, рассылки по расписанию — каждую минуту,
 * автоматические проверки (jobs.ts) — каждые 5 минут. Выключить: NOTIFICATION_WORKER=off (тестовый сервер).
 */
import { runDueBroadcasts } from './broadcasts';
import { installSendObserver, processOutbox } from './hub';
import { runScheduledJobs } from './jobs';

let started = false;

export function startNotificationWorker(): void {
  installSendObserver();
  if (started || (process.env.NOTIFICATION_WORKER ?? 'on').toLowerCase() === 'off') return;
  started = true;
  const safe = (name: string, fn: () => Promise<unknown>) => () =>
    void fn().catch((error) => console.warn(`[notify-worker] ${name} failed:`, (error as Error).message));
  setInterval(safe('outbox', () => processOutbox()), 15_000);
  setInterval(safe('broadcasts', () => runDueBroadcasts()), 60_000);
  setInterval(safe('jobs', () => runScheduledJobs()), 5 * 60_000);
  setTimeout(safe('jobs', () => runScheduledJobs()), 45_000);
}
