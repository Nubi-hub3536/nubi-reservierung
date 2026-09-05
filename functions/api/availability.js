import { getRlpHoliday } from "../../lib/holidays.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

const DEFAULT_CAPACITY = 8;

const NORMAL_TIMES = {
  Montag: ["13:00", "15:00", "17:00"],
  Dienstag: ["13:00", "15:00", "17:00"],
  Mittwoch: ["13:00", "15:00", "17:00"],
  Donnerstag: ["13:00", "15:00", "17:00"],
  Freitag: ["13:00", "15:00", "17:00"],
  Samstag: ["11:00", "13:00", "15:00", "17:00"],
  Sonntag: []
};

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    if (!env.DB) {
      return json(
        { error: "D1-Datenbank nicht verbunden." },
        500
      );
    }

    const url = new URL(request.url);
    const date = url.searchParams.get("date");

    if (!date) {
      return json({ error: "Datum fehlt." }, 400);
    }

    // Manuell komplett geschlossener Tag
    const closedDay = await env.DB
      .prepare(`
        SELECT date, reason
        FROM closed_days
        WHERE date = ?
        LIMIT 1
      `)
      .bind(date)
      .first();

    if (closedDay) {
      return json({
        date,
        times: [],
        closed: true,
        reason: closedDay.reason || "Geschlossen"
      });
    }

    // Eigene Zeiten und Kapazitäten für diesen Tag
    const customResult = await env.DB
      .prepare(`
        SELECT time, capacity, is_closed
        FROM custom_slots
        WHERE date = ?
        ORDER BY time
      `)
      .bind(date)
      .all();

    const customSlots = customResult.results || [];

    /*
      Gesetzliche Feiertage Rheinland-Pfalz:
      Standardmäßig geschlossen.

      Ausnahme:
      Wenn du über die Admin-Seite eigene Zeiten
      für diesen Feiertag speicherst, wird geöffnet.
    */
    const holiday = getRlpHoliday(date);

    if (holiday && customSlots.length === 0) {
      return json({
        date,
        times: [],
        closed: true,
        holiday: true,
        holidayName: holiday.name,
        reason: holiday.name
      });
    }

    // Bestehende Sperren
    const blockedResult = await env.DB
      .prepare(`
        SELECT
          time,
          SUM(blocked_seats) AS blocked
        FROM blocked_slots
        WHERE date = ?
        GROUP BY time
      `)
      .bind(date)
      .all();

    const blockedMap = {};

    for (const row of blockedResult.results || []) {
      blockedMap[row.time] = Number(row.blocked || 0);
    }

    // Bestehende Reservierungen
    const bookingResult = await env.DB
      .prepare(`
        SELECT
          time,
          SUM(persons) AS booked
        FROM bookings
        WHERE date = ?
          AND status = 'Bestätigt'
        GROUP BY time
      `)
      .bind(date)
      .all();

    const bookedMap = {};

    for (const row of bookingResult.results || []) {
      bookedMap[row.time] = Number(row.booked || 0);
    }

    let slotDefinitions = [];

    if (customSlots.length > 0) {
      // Eigener Tagesplan hat höchste Priorität
      slotDefinitions = customSlots
        .filter(
          row => Number(row.is_closed || 0) === 0
        )
        .map(row => ({
          time: row.time,
          capacity: Number(
            row.capacity || DEFAULT_CAPACITY
          )
        }));
    } else {
      // Alte importierte Calendly-/Urlaubszeiten prüfen.
      // Reine Admin-Sperren verändern den Tagesplan nicht.
      const legacyResult = await env.DB
        .prepare(`
          SELECT DISTINCT time
          FROM blocked_slots
          WHERE date = ?
            AND reason != 'Admin – manuell gesperrt'
          ORDER BY time
        `)
        .bind(date)
        .all();

      const legacyTimes = (
        legacyResult.results || []
      )
        .map(row => row.time)
        .filter(Boolean);

      if (legacyTimes.length > 0) {
        slotDefinitions = legacyTimes.map(time => ({
          time,
          capacity: DEFAULT_CAPACITY
        }));
      } else {
        const weekday = new Date(
          `${date}T12:00:00`
        ).toLocaleDateString("de-DE", {
          weekday: "long",
          timeZone: "Europe/Berlin"
        });

        slotDefinitions = (
          NORMAL_TIMES[weekday] || []
        ).map(time => ({
          time,
          capacity: DEFAULT_CAPACITY
        }));
      }
    }

    const slots = slotDefinitions
      .map(slot => {
        const blocked =
          blockedMap[slot.time] || 0;

        const booked =
          bookedMap[slot.time] || 0;

        const remaining = Math.max(
          0,
          slot.capacity - blocked - booked
        );

        return {
          time: slot.time,
          remaining,
          capacity: slot.capacity,
          available: remaining > 0
        };
      })
      .filter(slot => slot.remaining > 0);

    return json({
      date,
      times: slots,
      closed: false,
      holiday: Boolean(holiday),
      holidayName: holiday?.name || null
    });

  } catch (error) {
    console.error(error);

    return json(
      {
        error:
          "Verfügbarkeit konnte nicht geladen werden.",
        details: error?.message || String(error)
      },
      500
    );
  }
}
