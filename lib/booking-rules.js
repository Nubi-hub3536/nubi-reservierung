export const NEW_BOOKING_LOGIC_START = "2027-01-01";

export function usesNewBookingLogic(date) {
  if (!date) return false;

  return date >= NEW_BOOKING_LOGIC_START;
}
