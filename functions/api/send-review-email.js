function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

async function sendEmail(env, to, subject, html) {
  if (!env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY fehlt.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: "Nubi Mainz <reservierung@nubimainz.de>",
      to: [to],
      subject,
      html
    })
  });

  if (!response.ok) {
    throw new Error(`E-Mail konnte nicht gesendet werden: ${response.status}`);
  }
}

export async function onRequestGet(context) {
  const { env } = context;

  try {
    // Spalte nur einmal anlegen.
    // Falls sie schon existiert, ignorieren wir den Fehler.
    try {
      await env.DB
        .prepare(`
          ALTER TABLE bookings
          ADD COLUMN review_email_sent INTEGER DEFAULT 0
        `)
        .run();
    } catch (_) {}

    const now = new Date();

    // Deutschland-Zeit verwenden
    const formatter = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Berlin",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });

    const berlinNow = formatter.format(now);
    const [today, currentTime] = berlinNow.split(" ");

    const result = await env.DB
      .prepare(`
        SELECT
          id,
          name,
          email,
          date,
          time,
          status,
          COALESCE(review_email_sent, 0) AS review_email_sent
        FROM bookings
        WHERE status != 'Storniert'
          AND COALESCE(review_email_sent, 0) = 0
          AND email IS NOT NULL
          AND email != ''
          AND date <= ?
      `)
      .bind(today)
      .all();

    let sent = 0;

    for (const booking of result.results || []) {
const [year, month, day] = booking.date.split("-").map(Number);
const [hour, minute] = booking.time.split(":").map(Number);

const appointmentLocal = Date.UTC(
  year,
  month - 1,
  day,
  hour,
  minute
);

const [todayYear, todayMonth, todayDay] = today.split("-").map(Number);
const [currentHour, currentMinute] = currentTime.split(":").map(Number);

const nowLocal = Date.UTC(
  todayYear,
  todayMonth - 1,
  todayDay,
  currentHour,
  currentMinute
);

const sendAfter = appointmentLocal + 3 * 60 * 60 * 1000;

if (nowLocal < sendAfter) {
  continue;
}
      
      const customerHtml = `
        <div style="
          font-family:Arial,sans-serif;
          max-width:600px;
          margin:auto;
          color:#333;
        ">
          <h2>Danke für deinen Besuch bei Nubi Mainz 💕</h2>

          <p>Hallo ${booking.name || ""},</p>

          <p>
            schön, dass du heute bei uns warst! 💕
            Wir hoffen, du hattest eine tolle kreative Zeit bei Nubi Mainz
            und ganz viel Freude an deinem selbst gestalteten Unikat. ✨
          </p>

          <p>
            Wenn es dir bei uns gefallen hat, würden wir uns sehr über
            eine Google-Bewertung freuen.
            Deine Bewertung hilft uns als kleinem Laden sehr und hilft
            auch anderen, Nubi Mainz zu entdecken. 🌸
          </p>

          <p style="text-align:center;margin:30px 0;">
            <a
              href="https://maps.app.goo.gl/eJL4PHc9SXE62P1J9?g_st=aw"
              style="
                display:inline-block;
                background:#f3b6d2;
                color:#222;
                text-decoration:none;
                padding:14px 22px;
                border-radius:12px;
                font-weight:bold;
              "
            >
              ⭐ Nubi Mainz auf Google bewerten
            </a>
          </p>

          <p>
            Vielen Dank für deinen Besuch und hoffentlich bis ganz bald! 🎀
          </p>

          <p>
            Dein Nubi-Mainz-Team 💕
          </p>
        </div>
      `;

      await sendEmail(
        env,
        booking.email,
        "Danke für deinen Besuch bei Nubi Mainz 💕",
        customerHtml
      );

      await env.DB
        .prepare(`
          UPDATE bookings
          SET review_email_sent = 1
          WHERE id = ?
        `)
        .bind(booking.id)
        .run();

      sent++;
    }

    return json({
      success: true,
      sent
    });

  } catch (error) {
    console.error(error);

    return json(
      {
        success: false,
        error: error?.message || String(error)
      },
      500
    );
  }
}
