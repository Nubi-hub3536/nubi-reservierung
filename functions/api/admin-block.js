function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8"
    }
  });
}

export async function onRequestPost(context) {
  const { env, request } = context;

  try {
    const body = await request.json();

    const date = String(body.date || "");
    const time = String(body.time || "");
    const seats = Number(body.seats);
    const pin = String(body.pin || "");

    if (!env.ADMIN_PIN || pin !== env.ADMIN_PIN) {
      return json({ error: "Admin-PIN ist nicht korrekt." }, 401);
    }

    if (
      !date ||
      !time ||
      !Number.isInteger(seats) ||
      seats < 1 ||
      seats > 8
    ) {
      return json(
        { error: "Bitte gültiges Datum, Uhrzeit und Plätze auswählen." },
        400
      );
    }

    // Bereits bestätigte Reservierungen zählen
    const bookingRow = await env.DB
      .prepare(`
        SELECT COALESCE(SUM(persons), 0) AS total
        FROM bookings
        WHERE date = ?
          AND time = ?
          AND status = 'Bestätigt'
      `)
      .bind(date, time)
      .first();

    // Andere Sperren, z. B. alte Calendly-Termine, zählen
    const blockedRow = await env.DB
      .prepare(`
        SELECT COALESCE(SUM(blocked_seats), 0) AS total
        FROM blocked_slots
        WHERE date = ?
          AND time = ?
          AND reason != 'Admin – manuell gesperrt'
      `)
      .bind(date, time)
      .first();

    const booked = Number(bookingRow?.total || 0);
    const alreadyBlocked = Number(blockedRow?.total || 0);

    const maximum = Math.max(
      0,
      8 - booked - alreadyBlocked
    );

    if (seats > maximum) {
      return json(
        {
          error:
            `Es können höchstens ${maximum} Plätze zusätzlich gesperrt werden.`
        },
        400
      );
    }

    // Prüfen, ob schon eine manuelle Admin-Sperre existiert
    const existing = await env.DB
      .prepare(`
        SELECT id
        FROM blocked_slots
        WHERE date = ?
          AND time = ?
          AND reason = 'Admin – manuell gesperrt'
        LIMIT 1
      `)
      .bind(date, time)
      .first();

    if (existing) {
      // Vorhandene Sperre ändern
      await env.DB
        .prepare(`
          UPDATE blocked_slots
          SET blocked_seats = ?
          WHERE id = ?
        `)
        .bind(seats, existing.id)
        .run();

    } else {
      // Neue Sperre erstellen
      await env.DB
        .prepare(`
          INSERT INTO blocked_slots
            (date, time, blocked_seats, reason)
          VALUES
            (?, ?, ?, 'Admin – manuell gesperrt')
        `)
        .bind(date, time, seats)
        .run();
    }

    return json({
      success: true,
      message: "Termin wurde gespeichert."
    });

  } catch (error) {
    console.error(error);

    return json(
      { error: "Es ist ein Fehler aufgetreten." },
      500
    );
  }
}
