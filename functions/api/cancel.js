function html(content, status = 200) {
  return new Response(content, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8"
    }
  });
}

async function sendOwnerMail(env, booking) {
  if (!env.RESEND_API_KEY) return;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: "Nubi Mainz <reservierung@nubimainz.de>",
      to: ["nubimainz@gmail.com"],
      subject: `Reservierung storniert – ${booking.date} ${booking.time}`,
      html: `
        <h2>Reservierung storniert</h2>
        <p><strong>Name:</strong> ${booking.name || "-"}</p>
        <p><strong>Datum:</strong> ${booking.date || "-"}</p>
        <p><strong>Uhrzeit:</strong> ${booking.time || "-"}</p>
        <p><strong>Personen:</strong> ${booking.persons || "-"}</p>
        <p><strong>E-Mail:</strong> ${booking.email || "-"}</p>
        <p><strong>Telefon:</strong> ${booking.phone || "-"}</p>
      `
    })
  });
}

async function findBooking(env, bookingId) {
  return await env.DB
    .prepare(`
      SELECT
        id,
        name,
        email,
        phone,
        date,
        time,
        persons,
        status
      FROM bookings
      WHERE id = ?
      LIMIT 1
    `)
    .bind(bookingId)
    .first();
}

export async function onRequestGet(context) {
  try {
    const { request, env } = context;

    const url = new URL(request.url);
    const bookingId = url.searchParams.get("id");

    if (!bookingId) {
      return html("<h2>Ungültiger Stornierungslink.</h2>", 400);
    }

    const booking = await findBooking(env, bookingId);

    if (!booking) {
      return html("<h2>Reservierung nicht gefunden.</h2>", 404);
    }

    if (booking.status === "Storniert") {
      return html(`
        <div style="font-family:Arial;max-width:600px;margin:40px auto;text-align:center">
          <h2>Diese Reservierung wurde bereits storniert.</h2>
        </div>
      `);
    }

    return html(`
      <!doctype html>
      <html lang="de">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Reservierung stornieren</title>
        </head>

        <body style="font-family:Arial;background:#fff7fb;padding:20px">

          <div style="
            max-width:600px;
            margin:30px auto;
            background:white;
            padding:24px;
            border-radius:16px
          ">

            <h2>Reservierung stornieren</h2>

            <p><strong>Name:</strong> ${booking.name || "-"}</p>
            <p><strong>Datum:</strong> ${booking.date || "-"}</p>
            <p><strong>Uhrzeit:</strong> ${booking.time || "-"}</p>
            <p><strong>Personen:</strong> ${booking.persons || "-"}</p>

            <form method="POST">
              <input
                type="hidden"
                name="id"
                value="${bookingId}"
              >

              <button
                type="submit"
                style="
                  padding:14px 20px;
                  border:0;
                  border-radius:10px;
                  background:#222;
                  color:white;
                  font-size:16px
                "
              >
                Reservierung endgültig stornieren
              </button>
            </form>

          </div>

        </body>
      </html>
    `);

  } catch (error) {
    console.error(error);

    return html(
      "<h2>Fehler beim Laden der Reservierung.</h2>",
      500
    );
  }
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;

    const formData = await request.formData();
    const bookingId = formData.get("id");

    if (!bookingId) {
      return html("<h2>Ungültiger Stornierungslink.</h2>", 400);
    }

    const booking = await findBooking(env, bookingId);

    if (!booking) {
      return html("<h2>Reservierung nicht gefunden.</h2>", 404);
    }

    if (booking.status === "Storniert") {
      return html(`
        <div style="
          font-family:Arial;
          max-width:600px;
          margin:40px auto;
          text-align:center
        ">
          <h2>Diese Reservierung wurde bereits storniert.</h2>
        </div>
      `);
    }

    await env.DB
      .prepare(`
        UPDATE bookings
        SET status = 'Storniert'
        WHERE id = ?
      `)
      .bind(bookingId)
      .run();

    await sendOwnerMail(env, booking);

    return html(`
      <!doctype html>
      <html lang="de">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Storniert</title>
        </head>

        <body style="
          font-family:Arial;
          background:#fff7fb;
          padding:20px
        ">

          <div style="
            max-width:600px;
            margin:40px auto;
            background:white;
            padding:24px;
            border-radius:16px;
            text-align:center
          ">

            <h2>Reservierung storniert 💗</h2>

            <p>
              Deine Reservierung wurde erfolgreich storniert.
            </p>

            <p>
              Die Plätze sind wieder freigegeben.
            </p>

          </div>

        </body>
      </html>
    `);

  } catch (error) {
    console.error(error);

    return html(
      "<h2>Die Stornierung konnte nicht durchgeführt werden.</h2>",
      500
    );
  }
}
