const DEFAULT_CAPACITY = 8;
const MAX_CAPACITY = 30;

const NORMAL_TIMES = {
  Montag: ["13:00", "15:00", "17:00"],
  Dienstag: ["13:00", "15:00", "17:00"],
  Mittwoch: ["13:00", "15:00", "17:00"],
  Donnerstag: ["13:00", "15:00", "17:00"],
  Freitag: ["13:00", "15:00", "17:00"],
  Samstag: ["11:00", "13:00", "15:00", "17:00"],
  Sonntag: []
};

const FROM = "Nubi Mainz <reservierung@nubimainz.de>";
const OWNER_EMAIL = "nubimainz@gmail.com";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

async function sendEmail(env, to, subject, html) {
  if (!env.RESEND_API_KEY) return;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: FROM,
      to: [to],
      subject,
      html
    })
  });

  if (!response.ok) {
    console.error("E-Mail-Fehler:", await response.text());
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    if (!env.DB) {
      return json({ error: "D1-Datenbank nicht verbunden." }, 500);
    }

    const body = await request.json();

    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim();
    const phone = String(body.phone || "").trim();
    const date = String(body.date || "").trim();
    const time = String(body.time || "").trim();
    const persons = Number(body.persons);
    const note = String(body.note || "").trim();

    const cashConfirmed =
      body.cashConfirmed === true ||
      body.cash_confirmed === true;

    const phoneChecked =
      body.phoneChecked === true ||
      body.phone_checked === true;

    const safetyConfirmed =
      body.safetyConfirmed === true ||
      body.safety_confirmed === true;

    if (
      !name ||
      !email ||
      !date ||
      !time ||
      !Number.isInteger(persons) ||
      persons < 1 ||
      persons > MAX_CAPACITY
    ) {
      return json(
        { error: "Bitte alle Pflichtfelder korrekt ausfüllen." },
        400
      );
    }

    if (!cashConfirmed || !phoneChecked || !safetyConfirmed) {
      return json(
        { error: "Bitte alle Pflichtbestätigungen akzeptieren." },
        400
      );
    }

    // Ganzer Tag geschlossen?
    const closedDay = await env.DB
      .prepare(`
        SELECT date
        FROM closed_days
        WHERE date = ?
        LIMIT 1
      `)
      .bind(date)
      .first();

    if (closedDay) {
      return json(
        { error: "An diesem Tag sind keine Reservierungen möglich." },
        409
      );
    }

    let capacity = DEFAULT_CAPACITY;
    let slotAllowed = false;

    // Gibt es für diesen Tag eigene Zeiten?
    const customDay = await env.DB
      .prepare(`
        SELECT COUNT(*) AS total
        FROM custom_slots
        WHERE date = ?
      `)
      .bind(date)
      .first();

    const hasCustomSlots = Number(customDay?.total || 0) > 0;

    if (hasCustomSlots) {
      const customSlot = await env.DB
        .prepare(`
          SELECT time, capacity, is_closed
          FROM custom_slots
          WHERE date = ?
            AND time = ?
          LIMIT 1
        `)
        .bind(date, time)
        .first();

      if (
        customSlot &&
        Number(customSlot.is_closed || 0) === 0
      ) {
        slotAllowed = true;
        capacity = Number(
          customSlot.capacity || DEFAULT_CAPACITY
        );
      }
    } else {
      // Alte Calendly-/Urlaubszeiten prüfen.
      // Reine manuelle Admin-Sperren ändern den Tagesplan nicht.
      const legacyDay = await env.DB
        .prepare(`
          SELECT COUNT(*) AS total
          FROM blocked_slots
          WHERE date = ?
            AND reason != 'Admin – manuell gesperrt'
        `)
        .bind(date)
        .first();

      const hasLegacySlots =
        Number(legacyDay?.total || 0) > 0;

      if (hasLegacySlots) {
        const legacySlot = await env.DB
          .prepare(`
            SELECT COUNT(*) AS total
            FROM blocked_slots
            WHERE date = ?
              AND time = ?
              AND reason != 'Admin – manuell gesperrt'
          `)
          .bind(date, time)
          .first();

        if (Number(legacySlot?.total || 0) > 0) {
          slotAllowed = true;
          capacity = DEFAULT_CAPACITY;
        }
      } else {
        const weekday = new Date(
          `${date}T12:00:00`
        ).toLocaleDateString("de-DE", {
          weekday: "long",
          timeZone: "Europe/Berlin"
        });

        if ((NORMAL_TIMES[weekday] || []).includes(time)) {
          slotAllowed = true;
          capacity = DEFAULT_CAPACITY;
        }
      }
    }

    if (!slotAllowed) {
      return json(
        { error: "Diese Uhrzeit ist an diesem Tag nicht verfügbar." },
        409
      );
    }

    // Gesperrte Plätze
    const blockedResult = await env.DB
      .prepare(`
        SELECT COALESCE(SUM(blocked_seats), 0) AS blocked
        FROM blocked_slots
        WHERE date = ?
          AND time = ?
      `)
      .bind(date, time)
      .first();

    const blocked = Number(blockedResult?.blocked || 0);

    // Bereits reservierte Plätze
    const bookingResult = await env.DB
      .prepare(`
        SELECT COALESCE(SUM(persons), 0) AS booked
        FROM bookings
        WHERE date = ?
          AND time = ?
          AND status = 'Bestätigt'
      `)
      .bind(date, time)
      .first();

    const booked = Number(bookingResult?.booked || 0);

    const remaining = Math.max(
      0,
      capacity - blocked - booked
    );

    if (persons > remaining) {
      return json(
        {
          error:
            remaining > 0
              ? `Für diesen Termin sind nur noch ${remaining} Plätze frei.`
              : "Dieser Termin ist bereits ausgebucht."
        },
        409
      );
    }

    const id = crypto.randomUUID();

    await env.DB
      .prepare(`
        INSERT INTO bookings (
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
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Bestätigt')
      `)
      .bind(
        id,
        name,
        email,
        phone,
        date,
        time,
        persons,
        note,
        cashConfirmed ? 1 : 0,
        phoneChecked ? 1 : 0,
        safetyConfirmed ? 1 : 0
      )
      .run();

    const cancelUrl =
      `https://nubi-reservierung.pages.dev/api/cancel?id=${encodeURIComponent(id)}`;

    const customerHtml = `
      <h2>Deine Reservierung bei Nubi Mainz 💕</h2>

      <p>Hallo ${name},</p>

      <p>
        deine Reservierung wurde erfolgreich bestätigt.
      </p>

      <p>
        <strong>Datum:</strong> ${date}<br>
        <strong>Uhrzeit:</strong> ${time} Uhr<br>
        <strong>Personen:</strong> ${persons}
      </p>

      <p>
        <strong>Wichtig:</strong>
        Bei uns ist ausschließlich Barzahlung möglich.
      </p>

      <p>
        Falls du deine Reservierung nicht wahrnehmen kannst,
        kannst du sie hier stornieren:
      </p>

      <p>
        <a href="${cancelUrl}">
          Reservierung stornieren
        </a>
      </p>

      <p>
        Wir freuen uns auf dich! 💕<br>
        Nubi Mainz
      </p>
    `;

    const ownerHtml = `
      <h2>Neue Nubi-Reservierung</h2>

      <p>
        <strong>Name:</strong> ${name}<br>
        <strong>E-Mail:</strong> ${email}<br>
        <strong>Telefon:</strong> ${phone || "-"}<br>
        <strong>Datum:</strong> ${date}<br>
        <strong>Uhrzeit:</strong> ${time} Uhr<br>
        <strong>Personen:</strong> ${persons}<br>
        <strong>Kapazität:</strong> ${capacity}<br>
        <strong>Notiz:</strong> ${note || "-"}<br>
        <strong>Buchungs-ID:</strong> ${id}
      </p>
    `;

    await Promise.all([
      sendEmail(
        env,
        email,
        "Deine Reservierung bei Nubi Mainz 💕",
        customerHtml
      ),
      sendEmail(
        env,
        OWNER_EMAIL,
        `Neue Reservierung – ${date} ${time} Uhr`,
        ownerHtml
      )
    ]);

    return json({
      success: true,
      id,
      capacity,
      remaining: remaining - persons
    });

  } catch (error) {
    console.error(error);

    return json(
      {
        error: "Reservierung konnte nicht gespeichert werden.",
        details: error?.message || String(error)
      },
      500
    );
  }
}
