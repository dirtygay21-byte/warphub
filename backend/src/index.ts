import { createApp } from './app';
import { env } from './config/env';
import { refreshAddedAdmins } from './modules/admins/service';
import { startReminderWorker } from './modules/booking/reminders';
import { startNotificationWorker } from './modules/notifications/worker';
import { startDominatusExportWorker } from './modules/dominatus/export';
import { startTelegramUpdates } from './modules/roster/group';
import { hasNonGroupAccess } from './modules/roster/service';

const app = createApp();

// администраторы, добавленные в админке (N2): загрузить при старте и перечитывать раз в 5 минут
void refreshAddedAdmins();
setInterval(() => void refreshAddedAdmins(), 5 * 60_000);

app.listen(env.port);
startDominatusExportWorker();
startReminderWorker();
startNotificationWorker();
// WarpBuilder для подписчиков Boosty (17.11.2026): события бота «вступил / вышел» из группы подписчиков
if ((process.env.NOTIFICATION_WORKER ?? 'on').toLowerCase() !== 'off') startTelegramUpdates(hasNonGroupAccess);

console.log(`Warphub API is running at http://127.0.0.1:${env.port}`);

export type App = typeof app;
