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
function esc(value = "") {   return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function sendCancellationEmails(env, booking) {
  if (!env.RESEND_API_KEY) {
    return { sent: false };
  }

  const customerEmail =
    String(booking.email || "").trim();

  if (!customerEmail) {
    return { sent: false };
  }

  const customerHtml = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;line-height:1.6;color:#333">
      <h2 style="color:#f38db6">Reservierung storniert</h2>

      <p>Hallo ${esc(booking.name || "")},</p>

      <p>
        deine Reservierung bei <strong>Nubi Mainz</strong>
        wurde storniert.
      </p>

      <p>
        <strong>Datum:</strong> ${esc(booking.date || "-")}<br>
        <strong>Uhrzeit:</strong> ${esc(booking.time || "-")} Uhr<br>
        <strong>Personen:</strong> ${esc(booking.persons ?? "-")}
      </p>

      <p>Die reservierten Plätze wurden wieder freigegeben.</p>

      <p>
        Liebe Grüße<br>
        <strong>Nubi Mainz</strong>
      </p>
    </div>
  `;

  const response = await fetch(
    "https://api.resend.com/emails",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "Nubi Mainz <reservierung@nubimainz.de>",
        to: [customerEmail],
        subject:
          `Reservierung storniert – ${booking.date} ${booking.time}`,
        html: customerHtml
      })
    }
  );

  if (!response.ok) {
    console.error(
      "Kunden-Storno-Mail fehlgeschlagen:",
      await response.text()
    );
  }

  return {
    sent: response.ok
  };
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
let emailResult = { sent: false };

try {
  emailResult =
    await sendCancellationEmails(env, booking);
} catch (mailError) {
  console.error(
    "Storno-E-Mail Fehler:",
    mailError
  );
}
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
