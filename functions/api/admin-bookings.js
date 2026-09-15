function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function validPin(env, pin) {
  return Boolean(
    env.ADMIN_PIN &&
    String(pin || "").trim() === String(env.ADMIN_PIN).trim()
  );
}

/*
  GET
  /api/admin-bookings?pin=DEINPIN&date=2026-10-01

  Zeigt alle Reservierungen des ausgewählten Tages.
*/
export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    if (!env.DB) {
      return json(
        { error: "Datenbank nicht verbunden." },
        500
      );
    }

    const url = new URL(request.url);

    const pin = String(
      url.searchParams.get("pin") || ""
    ).trim();

    const date = String(
      url.searchParams.get("date") || ""
    ).trim();

    if (!validPin(env, pin)) {
      return json(
        { error: "Falsche Admin-PIN." },
        401
      );
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return json(
        { error: "Datum ist ungültig." },
        400
      );
    }

    const result = await env.DB
      .prepare(`
        SELECT
          id,
          name,
          email,
          phone,
          date,
          time,
          persons,
          note,
          cash_confirmed,
          phone_checked,
          safety_confirmed,
          status
        FROM bookings
        WHERE date = ?
        ORDER BY time ASC, name ASC
      `)
      .bind(date)
      .all();

    const bookings = result.results || [];

    return json({
      success: true,
      date,
      count: bookings.length,
      bookings
    });

  } catch (error) {
    console.error("Admin bookings GET:", error);

    return json(
      {
        error: "Reservierungen konnten nicht geladen werden.",
        details: error?.message || String(error)
      },
      500
    );
  }
}

/*
  POST
  Storniert eine einzelne Reservierung.

  JSON:
  {
    "pin": "....",
    "id": "Buchungs-ID"
  }
*/
export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    if (!env.DB) {
      return json(
        { error: "Datenbank nicht verbunden." },
        500
      );
    }

    const body = await request.json();

    const pin = String(body.pin || "").trim();
    const id = String(body.id || "").trim();

    if (!validPin(env, pin)) {
      return json(
        { error: "Falsche Admin-PIN." },
        401
      );
    }

    if (!id) {
      return json(
        { error: "Buchungs-ID fehlt." },
        400
      );
    }

    const booking = await env.DB
      .prepare(`
        SELECT
          id,
          name,
          email,
          phone,
          date,
          time,
          persons,
          note,
          cash_confirmed,
          phone_checked,
          safety_confirmed,
          status
        FROM bookings
        WHERE id = ?
        LIMIT 1
      `)
      .bind(id)
      .first();

    if (!booking) {
      return json(
        { error: "Reservierung nicht gefunden." },
        404
      );
    }

    if (booking.status === "Storniert") {
      return json({
        success: true,
        alreadyCancelled: true,
        message: "Diese Reservierung ist bereits storniert.",
        booking
      });
    }

    await env.DB
      .prepare(`
        UPDATE bookings
        SET status = 'Storniert'
        WHERE id = ?
      `)
      .bind(id)
      .run();

    return json({
      success: true,
      message: "Reservierung wurde storniert.",
      booking: {
        ...booking,
        status: "Storniert"
      }
    });

  } catch (error) {
    console.error("Admin bookings POST:", error);

    return json(
      {
        error: "Reservierung konnte nicht storniert werden.",
        details: error?.message || String(error)
      },
      500
    );
  }
}
