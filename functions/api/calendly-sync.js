const CALENDLY_USER =
  "https://api.calendly.com/users/2bb60ba2-b19e-4ae8-8a51-e411330231dd";

const DEFAULT_CAPACITY = 8;
const SLOT_DURATION_MINUTES = 90;

const NORMAL_TIMES = {
  Montag: ["13:00", "15:00", "17:00"],
  Dienstag: ["13:00", "15:00", "17:00"],
  Mittwoch: ["13:00", "15:00", "17:00"],
  Donnerstag: ["13:00", "15:00", "17:00"],
  Freitag: ["13:00", "15:00", "17:00"],
  Samstag: ["11:00", "13:00", "15:00", "17:00"],
  Sonntag: []
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function berlinDateTime(isoString) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date(isoString));

  const values = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`
  };
}

function todayBerlin() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const values = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  return `${values.year}-${values.month}-${values.day}`;
}

function timeToMinutes(time) {
  const [hour, minute] =
    time.split(":").map(Number);

  return hour * 60 + minute;
}

function normalTimesForDate(date) {
  const weekday = new Date(
    `${date}T12:00:00`
  ).toLocaleDateString("de-DE", {
    weekday: "long",
    timeZone: "Europe/Berlin"
  });

  return NORMAL_TIMES[weekday] || [];
}

function overlaps(
  firstStart,
  firstEnd,
  secondStart,
  secondEnd
) {
  return (
    firstStart < secondEnd &&
    firstEnd > secondStart
  );
}

async function getCalendlyEvents(token, status) {
  const events = [];

  let url =
    "https://api.calendly.com/scheduled_events" +
    `?user=${encodeURIComponent(CALENDLY_USER)}` +
    `&status=${encodeURIComponent(status)}` +
    `&min_start_time=${encodeURIComponent(
      new Date().toISOString()
    )}` +
    "&count=100" +
    "&sort=start_time:asc";

  while (url) {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      const errorText = await response.text();

      throw new Error(
        `Calendly API Fehler ${response.status}: ${errorText}`
      );
    }

    const data = await response.json();

    if (Array.isArray(data.collection)) {
      events.push(...data.collection);
    }

    url = data.pagination?.next_page || null;
  }

  return events;
}

async function syncCalendly(context) {
  const { env } = context;

  try {
    if (!env.DB) {
      return json(
        { error: "D1-Datenbank nicht verbunden." },
        500
      );
    }

    if (!env.CALENDLY_TOKEN) {
      return json(
        { error: "CALENDLY_TOKEN fehlt." },
        500
      );
    }

    const [
      activeEvents,
      canceledEvents
    ] = await Promise.all([
      getCalendlyEvents(
        env.CALENDLY_TOKEN,
        "active"
      ),
      getCalendlyEvents(
        env.CALENDLY_TOKEN,
        "canceled"
      )
    ]);

    const allEvents = [
      ...activeEvents,
      ...canceledEvents
    ];

    /*
      Alle bekannten alten Calendly-Uhrzeiten merken.
      Auch vollständig stornierte Termine bleiben
      dadurch als mögliche Uhrzeit erhalten.
    */
    const knownSlots = new Set();

    for (const event of allEvents) {
      const local =
        berlinDateTime(event.start_time);

      knownSlots.add(
        `${local.date}|${local.time}`
      );
    }

    /*
      Aktive Personen je Calendly-Termin.
    */
    const activeSlots = new Map();

    /*
      Aktive Calendly-Zeitfenster je Datum.
      Damit verhindern wir Überschneidungen.
    */
    const activeIntervalsByDate = new Map();

    for (const event of activeEvents) {
      const active =
        Number(
          event.invitees_counter?.active || 0
        );

      const local =
        berlinDateTime(event.start_time);

      const key =
        `${local.date}|${local.time}`;

      if (active > 0) {
        activeSlots.set(
          key,
          (activeSlots.get(key) || 0) + active
        );
      }

      const startMinutes =
        timeToMinutes(local.time);

      const durationMinutes =
        Math.max(
          1,
          Math.round(
            (
              new Date(event.end_time) -
              new Date(event.start_time)
            ) / 60000
          )
        );

      const interval = {
        start: startMinutes,
        end:
          startMinutes + durationMinutes
      };

      if (
        !activeIntervalsByDate.has(local.date)
      ) {
        activeIntervalsByDate.set(
          local.date,
          []
        );
      }

      activeIntervalsByDate
        .get(local.date)
        .push(interval);
    }

    /*
      Normale Nubi-Zeiten sperren, wenn deren
      90-Minuten-Zeitraum einen aktiven alten
      Calendly-Termin überschneiden würde.

      Beispiel:
      Calendly 14:00–15:30
      11:00 = erlaubt
      13:00 = gesperrt
      14:00 = Calendly-Plätze
      15:00 = gesperrt
      17:00 = erlaubt
    */
    const conflictSlots = new Set();

    for (
      const [date, intervals]
      of activeIntervalsByDate
    ) {
      const normalTimes =
        normalTimesForDate(date);

      for (const time of normalTimes) {
        const key = `${date}|${time}`;

        /*
          Ist exakt zu dieser Uhrzeit schon
          ein aktiver Calendly-Termin,
          verwenden wir dessen Restplätze.
        */
        if (activeSlots.has(key)) {
          continue;
        }

        const start =
          timeToMinutes(time);

        const end =
          start + SLOT_DURATION_MINUTES;

        const hasConflict =
          intervals.some(interval =>
            overlaps(
              start,
              end,
              interval.start,
              interval.end
            )
          );

        if (hasConflict) {
          conflictSlots.add(key);
        }
      }
    }

    const fromDate = todayBerlin();

    const statements = [
      env.DB
        .prepare(`
          DELETE FROM blocked_slots
          WHERE date >= ?
            AND reason LIKE '%Calendly%'
        `)
        .bind(fromDate)
    ];

    /*
      Aktive Calendly-Belegungen speichern.
    */
    for (
      const [key, active]
      of activeSlots
    ) {
      const [date, time] =
        key.split("|");

      statements.push(
        env.DB
          .prepare(`
            INSERT INTO blocked_slots (
              date,
              time,
              blocked_seats,
              reason
            )
            VALUES (?, ?, ?, 'Calendly Sync')
          `)
          .bind(
            date,
            time,
            active
          )
      );
    }

    /*
      Vollständig stornierte alte Calendly-
      Uhrzeiten mit 0 Plätzen behalten.
    */
    for (const key of knownSlots) {
      if (activeSlots.has(key)) {
        continue;
      }

      const [date, time] =
        key.split("|");

      statements.push(
        env.DB
          .prepare(`
            INSERT INTO blocked_slots (
              date,
              time,
              blocked_seats,
              reason
            )
            VALUES (?, ?, 0, 'Calendly Slot')
          `)
          .bind(
            date,
            time
          )
      );
    }

    /*
      Überschneidende normale Uhrzeiten
      komplett sperren.
    */
    for (const key of conflictSlots) {
      const [date, time] =
        key.split("|");

      statements.push(
        env.DB
          .prepare(`
            INSERT INTO blocked_slots (
              date,
              time,
              blocked_seats,
              reason
            )
            VALUES (?, ?, ?, 'Calendly Konflikt')
          `)
          .bind(
            date,
            time,
            DEFAULT_CAPACITY
          )
      );
    }

    await env.DB.batch(statements);

    return json({
      success: true,
      activeEvents: activeEvents.length,
      canceledEvents: canceledEvents.length,
      activeSlots: activeSlots.size,
      knownSlots: knownSlots.size,
      conflictSlots: conflictSlots.size
    });

  } catch (error) {
    console.error(
      "Calendly Sync Fehler:",
      error
    );

    return json(
      {
        success: false,
        error:
          error?.message || String(error)
      },
      500
    );
  }
}

export async function onRequestGet(context) {
  return syncCalendly(context);
}

export async function onRequestPost(context) {
  return syncCalendly(context);
}
