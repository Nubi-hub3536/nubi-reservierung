function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

const CAPACITY = 8;

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
      return json({ error: "D1-Datenbank nicht verbunden." }, 500);
    }

    const url = new URL(request.url);
    const date = url.searchParams.get("date");

    if (!date) {
      return json({ error: "Datum fehlt." }, 400);
    }

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

    const bookingResult = await env.DB
      .prepare(`
        SELECT
          time,
          SUM(persons) AS booked
        FROM bookings
        WHERE date = ?
          AND status != 'Storniert'
        GROUP BY time
      `)
      .bind(date)
      .all();

    const blockedMap = {};

    for (const row of blockedResult.results || []) {
      blockedMap[row.time] = Number(row.blocked || 0);
    }

    const bookedMap = {};

    for (const row of bookingResult.results || []) {
      bookedMap[row.time] = Number(row.booked || 0);
    }

    const blockedTimes = Object.keys(blockedMap);

    let times = [];

    if (blockedTimes.length > 0) {
      times = blockedTimes.sort();
    } else {
      const weekday = new Date(`${date}T12:00:00`).toLocaleDateString(
        "de-DE",
        {
          weekday: "long",
          timeZone: "Europe/Berlin"
        }
      );

      times = NORMAL_TIMES[weekday] || [];
    }

    const slots = times
      .map(time => {
        const blocked = blockedMap[time] || 0;
        const booked = bookedMap[time] || 0;

        const remaining = Math.max(
          0,
          CAPACITY - blocked - booked
        );

        return {
          time,
          remaining
        };
      })
      .filter(slot => slot.remaining > 0);

    return json({
  date,
  times: slots.map(slot => ({
    time: slot.time,
    remaining: slot.remaining,
    capacity: CAPACITY,
    available: slot.remaining > 0
  }))
});

  } catch (error) {
    console.error(error);

    return json(
      {
        error: "Verfügbarkeit konnte nicht geladen werden.",
        details: error?.message || String(error)
      },
      500
    );
  }
}
