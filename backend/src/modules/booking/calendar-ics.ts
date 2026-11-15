/** Сборка файла .ics — отдельно от базы данных, чтобы проверять без окружения. */
const CLUB = 'WarpHub';

/** 20261115T150000Z — время в UTC для iCalendar */
const icsTime = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Экранирование текста iCalendar: \ ; , и переводы строк */
const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

export function buildIcs(input: { id: string; title: string; startsAt: Date; endsAt: Date | null; location?: string | null; now?: Date }): string {
  const end = input.endsAt ?? new Date(input.startsAt.getTime() + 60 * 60 * 1000);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//WarpHub//Booking//RU',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${input.id}@warphub`,
    `DTSTAMP:${icsTime(input.now ?? new Date())}`,
    `DTSTART:${icsTime(input.startsAt)}`,
    `DTEND:${icsTime(end)}`,
    `SUMMARY:${icsText(`${CLUB}: ${input.title}`)}`,
    ...(input.location ? [`LOCATION:${icsText(input.location)}`] : []),
    'BEGIN:VALARM',
    'TRIGGER:-PT1H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${icsText(`${CLUB}: ${input.title}`)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n') + '\r\n';
}


export { CLUB };
