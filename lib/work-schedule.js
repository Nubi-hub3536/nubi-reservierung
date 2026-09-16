const WEEKDAY_NORMAL_TIMES = [
  "13:00",
  "15:00",
  "17:00"
];

const WEEKDAY_LATE_TIMES = [
  "14:00",
  "16:00"
];

const SATURDAY_LATE_TIMES = [
  "11:00",
  "14:00",
  "17:00"
];

const SATURDAY_FREE_EARLY_TIMES = [
  "11:00",
  "12:30",
  "14:00",
  "15:30",
  "17:00",
  "18:30"
];

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function getShiftType(summary) {
  const text = normalize(summary);

  if (!text) {
    return "unknown";
  }

  if (text === "frei") {
    return "free";
  }

  // Spätdienst
  if (
    text.startsWith("13:15") ||
    text.startsWith("14:00")
  ) {
    return "late";
  }

  // Frühdienst
  if (
    text.startsWith("05:00") ||
    text.startsWith("05:30") ||
    text.startsWith("07:00")
  ) {
    return "early";
  }

  return "unknown";
}

export function getNewBookingTimes(
  weekday,
  shiftSummary
) {
  const shiftType = getShiftType(shiftSummary);

  // Sonntag immer geschlossen
  if (weekday === "Sonntag") {
    return [];
  }

  // Samstag
  if (weekday === "Samstag") {
    if (shiftType === "late") {
      return SATURDAY_LATE_TIMES;
    }

    if (
      shiftType === "free" ||
      shiftType === "early"
    ) {
      return SATURDAY_FREE_EARLY_TIMES;
    }

    return [];
  }

  // Montag bis Freitag
  if (
    weekday === "Montag" ||
    weekday === "Dienstag" ||
    weekday === "Mittwoch" ||
    weekday === "Donnerstag" ||
    weekday === "Freitag"
  ) {
    if (shiftType === "late") {
      return WEEKDAY_LATE_TIMES;
    }

    if (
      shiftType === "free" ||
      shiftType === "early"
    ) {
      return WEEKDAY_NORMAL_TIMES;
    }
  }

  // Unbekannter Arbeitszeit-Eintrag:
  // vorsichtshalber keine Termine freigeben
  return [];
}
