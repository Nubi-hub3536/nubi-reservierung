const BASE_ID = "appp9KaXdhwJ3H85L";
const BOOKINGS_TABLE = "tblXP5bZB9nCbIYfP";

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
      subject: `Reservierung storniert – ${booking.Datum} ${booking.Uhrzeit}`,
      html: `
        <h2>Reservierung storniert</h2>
        <p><strong>Name:</strong> ${booking.Buchungsname || "-"}</p>
        <p><strong>Datum:</strong> ${booking.Datum || "-"}</p>
        <p><strong>Uhrzeit:</strong> ${booking.Uhrzeit || "-"}</p>
        <p><strong>Personen:</strong> ${booking.Personen || "-"}</p>
        <p><strong>E-Mail:</strong> ${booking["E-Mail"] || "-"}</p>
        <p><strong>Telefon:</strong> ${booking.Telefon || "-"}</p>
      `
    })
  });
}

async function findBooking(env, bookingId) {
  const formula = `{Buchungs-ID}='${bookingId}'`;

  const response = await fetch(
    `https://api.airtable.com/v0/${BASE_ID}/${BOOKINGS_TABLE}?filterByFormula=${encodeURIComponent(formula)}`,
    {
      headers: {
        Authorization: `Bearer ${env.AIRTABLE_TOKEN}`
      }
    }
  );

  if (!response.ok) {
    throw new Error("Airtable-Abfrage fehlgeschlagen");
  }

  const data = await response.json();

  return data.records?.[0] || null;
}

export async function onRequestGet(context) {
  try {
    const { request, env } = context;

    const url = new URL(request.url);
    const bookingId = url.searchParams.get("id");

    if (!bookingId) {
      return html("<h2>Ungültiger Stornierungslink.</h2>", 400);
    }

    const record = await findBooking(env, bookingId);

    if (!record) {
      return html("<h2>Reservierung nicht gefunden.</h2>", 404);
    }

    const b = record.fields;

    if (b.Status === "Storniert") {
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
          <div style="max-width:600px;margin:30px auto;background:white;padding:24px;border-radius:16px">
            <h2>Reservierung stornieren</h2>

            <p><strong>Name:</strong> ${b.Buchungsname || "-"}</p>
            <p><strong>Datum:</strong> ${b.Datum || "-"}</p>
            <p><strong>Uhrzeit:</strong> ${b.Uhrzeit || "-"}</p>
            <p><strong>Personen:</strong> ${b.Personen || "-"}</p>

            <form method="POST">
              <input type="hidden" name="id" value="${bookingId}">
              <button
                type="submit"
                style="padding:14px 20px;border:0;border-radius:10px;background:#222;color:white;font-size:16px"
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
    return html("<h2>Fehler beim Laden der Reservierung.</h2>", 500);
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

    const record = await findBooking(env, bookingId);

    if (!record) {
      return html("<h2>Reservierung nicht gefunden.</h2>", 404);
    }

    if (record.fields.Status === "Storniert") {
      return html(`
        <div style="font-family:Arial;max-width:600px;margin:40px auto;text-align:center">
          <h2>Diese Reservierung wurde bereits storniert.</h2>
        </div>
      `);
    }

    const updateResponse = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${BOOKINGS_TABLE}/${record.id}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${env.AIRTABLE_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          fields: {
            Status: "Storniert"
          }
        })
      }
    );

    if (!updateResponse.ok) {
      throw new Error("Stornierung konnte nicht gespeichert werden");
    }

    await sendOwnerMail(env, record.fields);

    return html(`
      <!doctype html>
      <html lang="de">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Storniert</title>
        </head>
        <body style="font-family:Arial;background:#fff7fb;padding:20px">
          <div style="max-width:600px;margin:40px auto;background:white;padding:24px;border-radius:16px;text-align:center">
            <h2>Reservierung storniert 💗</h2>
            <p>Deine Reservierung wurde erfolgreich storniert.</p>
            <p>Die Plätze sind wieder freigegeben.</p>
          </div>
        </body>
      </html>
    `);

  } catch (error) {
    console.error(error);
    return html("<h2>Die Stornierung konnte nicht durchgeführt werden.</h2>", 500);
  }
}
