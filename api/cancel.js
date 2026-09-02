const BASE_ID = "appp9KaXdhwJ3H85L";
const BOOKINGS_TABLE = "tblXP5bZB9nCbIYfP";

export default async function handler(req, res) {
  try {
    const bookingId = String(req.query?.id || "").trim();

    if (!bookingId) {
      return res.status(400).send("Buchungs-ID fehlt.");
    }

    const token = process.env.AIRTABLE_TOKEN;

    if (!token) {
      throw new Error("AIRTABLE_TOKEN fehlt");
    }

    const formula = `{Buchungs-ID}='${bookingId.replaceAll("'", "\\'")}'`;

    const searchUrl =
      `https://api.airtable.com/v0/${BASE_ID}/${BOOKINGS_TABLE}` +
      `?maxRecords=1&filterByFormula=${encodeURIComponent(formula)}`;

    const searchResponse = await fetch(searchUrl, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!searchResponse.ok) {
      throw new Error(await searchResponse.text());
    }

    const data = await searchResponse.json();
    const record = data.records?.[0];

    if (!record) {
      return res.status(404).send("Reservierung wurde nicht gefunden.");
    }

    if (record.fields.Status === "Storniert") {
      return res.status(200).send(`
        <h2>Reservierung bereits storniert</h2>
        <p>Diese Reservierung wurde bereits storniert.</p>
      `);
    }

    if (req.method === "GET") {
      return res.status(200).send(`
        <!doctype html>
        <html lang="de">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width,initial-scale=1">
          <title>Reservierung stornieren – Nubi Mainz</title>
        </head>
        <body style="font-family:Arial,sans-serif;max-width:520px;margin:50px auto;padding:20px;text-align:center;">
          <h1>Reservierung stornieren?</h1>

          <p>
            ${record.fields.Datum || ""}<br>
            ${record.fields.Uhrzeit || ""} Uhr<br>
            ${record.fields.Personen || ""} Person(en)
          </p>

          <form method="POST" action="/api/cancel?id=${encodeURIComponent(bookingId)}">
            <button
              type="submit"
              style="padding:14px 22px;font-size:16px;cursor:pointer;"
            >
              Ja, Reservierung stornieren
            </button>
          </form>
        </body>
        </html>
      `);
    }

    if (req.method !== "POST") {
      return res.status(405).send("Methode nicht erlaubt.");
    }

    const updateResponse = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${BOOKINGS_TABLE}/${record.id}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
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
      throw new Error(await updateResponse.text());
    }

    return res.status(200).send(`
      <!doctype html>
      <html lang="de">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <title>Reservierung storniert – Nubi Mainz</title>
      </head>
      <body style="font-family:Arial,sans-serif;max-width:520px;margin:50px auto;padding:20px;text-align:center;">
        <h1>Reservierung storniert 💗</h1>
        <p>Deine Reservierung bei Nubi Mainz wurde erfolgreich storniert.</p>
        <p>Die reservierten Plätze sind wieder freigegeben.</p>
      </body>
      </html>
    `);

  } catch (error) {
    console.error(error);

    return res.status(500).send(
      "Die Reservierung konnte leider nicht storniert werden."
    );
  }
}
