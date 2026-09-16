import { getShiftType } from "./work-schedule.js";

const CACHE_MS = 5 * 60 * 1000;

let cachedCalendar = {
  loadedAt: 0,
  text: null
};

function unfoldIcal(text) {
  return String(text || "").replace(/\r?\n[ \t]/g, "");
}

function decodeIcalText(value) {
  return String(value || "")
    .replace(/\\n/gi, " ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

function berlinDateFromUtc(value) {
  const match = String(value || "").match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/
  );

  if (!match) return null;

  const [, year, month, day, hour, minute, second] = match;

  const utcDate = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    )
  );

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(utcDate);

  const values = {};

  for (const part of parts) {
    values[part.type] = part.value;
  }

  return `${values.year}-${values.month}-${values.day}`;
}

function getEventDate(dtstartLine) {
  if (!dtstartLine) return null;

  const separatorIndex = dtstartLine.indexOf(":");

  if (separatorIndex === -1) return null;

  const value = dtstartLine
    .slice(separatorIndex + 1)
    .trim();

  // UTC-Zeit
  if (value.endsWith("Z")) {
    return berlinDateFromUtc(value);
  }

  // Lokale Uhrzeit oder ganztägiger Eintrag
  const match = value.match(/^(\d{4})(\d{2})(\d{2})/);

  if (!match) return null;

  return `${match[1]}-${match[2]}-${match[3]}`;
}

async function loadCalendar(env) {
  const calendarUrl =
    env.GOOGLE_CALENDAR_ICAL_URL;

  if (!calendarUrl) {
    throw new Error(
      "GOOGLE_CALENDAR_ICAL_URL ist nicht eingerichtet."
    );
  }

  const now = Date.now();

  if (
    cachedCalendar.text &&
    now - cachedCalendar.loadedAt < CACHE_MS
  ) {
    return cachedCalendar.text;
  }

  const response = await fetch(calendarUrl, {
    headers: {
      "Cache-Control": "no-cache"
    }
  });

  if (!response.ok) {
    throw new Error(
      `Google Kalender konnte nicht geladen werden (${response.status}).`
    );
  }

  const text = await response.text();

  cachedCalendar = {
    loadedAt: now,
    text
  };

  return text;
}

export async function getShiftSummaryForDate(
  env,
  date
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return null;
  }

  const calendarText = await loadCalendar(env);
  const unfolded = unfoldIcal(calendarText);

  const events = unfolded.match(
    /BEGIN:VEVENT[\s\S]*?END:VEVENT/g
  ) || [];

  for (const event of events) {
    const lines = event.split(/\r?\n/);

    const dtstartLine = lines.find(
      line => line.startsWith("DTSTART")
    );

    const eventDate =
      getEventDate(dtstartLine);

    if (eventDate !== date) {
      continue;
    }

    const summaryLine = lines.find(
      line => line.startsWith("SUMMARY:")
    );

    if (!summaryLine) {
      continue;
    }

    const summary = decodeIcalText(
      summaryLine.slice("SUMMARY:".length)
    );

    // Nur echte Arbeitszeit-Einträge akzeptieren.
    // Arzt, Nubi-Buchungen, private Termine usw.
    // werden dadurch ignoriert.
    if (getShiftType(summary) !== "unknown") {
      return summary;
    }
  }

  return null;
}
