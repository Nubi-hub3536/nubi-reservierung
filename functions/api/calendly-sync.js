const CALENDLY_USER =
  "https://api.calendly.com/users/2bb60ba2-b19e-4ae8-8a51-e411330231dd";

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

async function getCalendlyEvents(token) {
  const events = [];

  let url =
    "https://api.calendly.com/scheduled_events" +
    `?user=${encodeURIComponent(CALENDLY_USER)}` +
    "&status=active" +
    `&min_start_time=${encodeURIComponent(new Date().toISOString())}` +
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

    const events =
      await getCalendlyEvents(env.CALENDLY_TOKEN);

    const slots = new Map();

    for (const event of events) {
      const active =
        Number(event.invitees_counter?.active || 0);

      if (active <= 0) {
        continue;
      }

      const local =
        berlinDateTime(event.start_time);

      const key =
        `${local.date}|${local.time}`;

      const previous =
        slots.get(key) || 0;

      slots.set(
        key,
        previous + active
      );
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

    for (const [key, active] of slots) {
      const [date, time] = key.split("|");

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

    await env.DB.batch(statements);

    return json({
      success: true,
      calendlyEvents: events.length,
      syncedSlots: slots.size,
      slots: Array.from(slots.entries()).map(
        ([key, active]) => {
          const [date, time] = key.split("|");

          return {
            date,
            time,
            active
          };
        }
      )
    });

  } catch (error) {
    console.error("Calendly Sync Fehler:", error);

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
