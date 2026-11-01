import { status } from 'elysia';
import { DndError } from './service';

export function mapDndError(error: DndError) {
  switch (error.code) {
    case 'GAME_NOT_FOUND':
    case 'BOOKING_NOT_FOUND':
    case 'REQUEST_NOT_FOUND':
      return status(404, { error: error.message });
    case 'GAME_FULL':
    case 'ALREADY_BOOKED':
    case 'REQUEST_ALREADY_OPEN':
    case 'GAME_HAS_BOOKINGS':
    case 'CLUB_BUSY':
      return status(409, { error: error.message });
    case 'GAME_NOT_OPEN':
    case 'GAME_STARTED':
    case 'CAPACITY_BELOW_BOOKINGS':
    case 'INVALID_INPUT':
      return status(400, { error: error.message });
    default: {
      const _exhaustive: never = error.code;
      return status(500, { error: 'Unexpected D&D error' });
    }
  }
}
