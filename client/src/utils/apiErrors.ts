/** Перевод сообщений сервера для пользователя */
const EXACT: Record<string, string> = {
  "This game is already full": "Эта игра уже заполнена — выберите другую",
  "The table is already taken at this time": "Стол уже занят на это время",
  "The table is reserved for an event at this time":
    "В это время стол занят под ивент",
  "Selected time is in the past": "Выбранное время уже прошло",
  "Selected time slot is not available": "Это время недоступно для записи",
  "This activity can only be booked on Friday, Saturday or Sunday":
    "Записаться можно только на пятницу, субботу или воскресенье",
  "You are already booked for this game": "Вы уже записаны на эту игру",
  "No places left": "Свободных мест не осталось",
  "No places left in this game": "В игре не осталось мест",
  "Booking for this game is closed": "Запись на эту игру закрыта",
  "This game has already started": "Игра уже началась",
  "You already have an open request. Cancel it to send a new one.":
    "У вас уже есть активная заявка. Отмените её, чтобы отправить новую.",
  "The booking has already started":
    "Запись уже началась — изменить данные нельзя",
  Unauthorized: "Не удалось войти. Откройте приложение через Telegram.",
  'The game has bookings. Set its status to "cancelled" instead of deleting.':
    "На игру уже записались. Вместо удаления поставьте статус «Отменена».",
  "The target table is not free for this game":
    "Этот стол занят в это время",
  "Reservation is already cancelled": "Запись уже отменена",
  "Each Warhammer player books one place":
    "Каждый игрок записывается сам за себя",
  "Game not found": "Игра не найдена",
  "Booking not found": "Запись не найдена",
  "Request not found": "Заявка не найдена",
  "Table not found": "Стол не найден",
  "Service not found": "Услуга не найдена",
};

const PATTERNS: Array<[RegExp, string]> = [
  [/^Only (\d+) places left in this game$/, "В игре осталось мест: $1"],
  [/^Only (\d+) places left$/, "Осталось мест: $1"],
  [
    /^Capacity cannot be less than (\d+) already booked places$/,
    "Вместимость не может быть меньше уже занятых мест ($1)",
  ],
  [/^partySize cannot exceed (\d+)$/, "Не больше $1 мест в одной записи"],
];

export function translateApiError(message: string): string {
  if (EXACT[message]) return EXACT[message];
  for (const [pattern, replacement] of PATTERNS) {
    if (pattern.test(message)) return message.replace(pattern, replacement);
  }
  return message;
}
