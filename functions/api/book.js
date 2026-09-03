const BASE_ID = "appp9KaXdhwJ3H85L";
const BOOKINGS_TABLE = "tblXP5bZB9nCbIYfP";
const CAPACITY = 8;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();

    const {
      date,
      time,
      people,
      name,
      email,
      phone,
      note
    } = body;

    const personen = Number(people);

    if (
      !date ||
      !time ||
      !name ||
      !email ||
      !phone ||
      !personen ||
      personen < 1 ||
      personen > CAPACITY
    ) {
      return json(
        { error: "Bitte alle Pflichtfelder korrekt ausfüllen." },
        400
      );
    }

    if (!env.AIRTABLE_TOKEN) {
      return json({ error: "AIRTABLE_TOKEN fehlt." }, 500);
    }
const formula =
  `AND(DATETIME_FORMAT({Datum}, 'YYYY-MM-DD')='${date}',{Uhrzeit}='${time}',{Status}='Bestätigt')`;

const checkResponse = await fetch(
  `https://api.airtable.com/v0/${BASE_ID}/${BOOKINGS_TABLE}?filterByFormula=${encodeURIComponent(formula)}`,
  {
    headers: {
      Authorization: `Bearer ${env.AIRTABLE_TOKEN}`
    }
  }
);

if (!checkResponse.ok) {
  return json({ error: "Verfügbarkeit konnte nicht geprüft werden." }, 500);
}

const checkData = await checkResponse.json();

const bereitsGebucht = checkData.records.reduce(
  (sum, record) => sum + Number(record.fields.Personen || 0),
  0
);

const BLOCKED_TABLE = "tblixvX34OWlZcb38";

const blockFormula =
  `DATETIME_FORMAT({Datum}, 'YYYY-MM-DD')='${date}'`;

const blockResponse = await fetch(
  `https://api.airtable.com/v0/${BASE_ID}/${BLOCKED_TABLE}?filterByFormula=${encodeURIComponent(blockFormula)}`,
  {
    headers: {
      Authorization: `Bearer ${env.AIRTABLE_TOKEN}`
    }
  }
);

if (!blockResponse.ok) {
  return json({ error: "Gesperrte Plätze konnten nicht geprüft werden." }, 500);
}

const blockData = await blockResponse.json();

const calendlyRecords = blockData.records.filter(record =>
  String(record.fields.Grund || "")
    .toLowerCase()
    .includes("calendly")
);

if (
  calendlyRecords.length > 0 &&
  !calendlyRecords.some(record => record.fields.Uhrzeit === time)
) {
  return json(
    { error: "Diese Uhrzeit ist an diesem Tag nicht verfügbar." },
    409
  );
}

const gesperrt = blockData.records
  .filter(record => record.fields.Uhrzeit === time)
  .reduce(
    (sum, record) =>
      sum + Number(record.fields["Gesperrte Plätze"] || 0),
    0
  );

const nochFrei = Math.max(
  0,
  CAPACITY - bereitsGebucht - gesperrt
);

if (personen > nochFrei) {
  return json(
    {
      error:
        nochFrei === 0
          ? "Dieser Termin ist leider bereits ausgebucht."
          : `Für diesen Termin sind nur noch ${nochFrei} Plätze frei.`
    },
    409
  );
}
    const bookingId = crypto.randomUUID();

    const airtableResponse = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${BOOKINGS_TABLE}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.AIRTABLE_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          fields: {
            "Buchungsname": name,
            "E-Mail": email,
            "Telefon": phone,
            "Datum": date,
            "Uhrzeit": time,
            "Personen": personen,
            "Anlass": "Normaler Besuch",
            "Notiz": note || "",
            "Barzahlung bestätigt": true,
            "Handyhülle geprüft": true,
            "Sicherheits- & Materialhinweise bestätigt": true,
            "Status": "Bestätigt",
            "Buchungs-ID": bookingId
          }
        })
      }
    );

    if (!airtableResponse.ok) {
      const errorText = await airtableResponse.text();
      console.error(errorText);

      return json(
        { error: "Reservierung konnte nicht gespeichert werden." },
        500
      );
    }

    const record = await airtableResponse.json();
let emailSent = false;

if (env.RESEND_API_KEY) {
  const cancelUrl =
    `https://nubi-reservierung.pages.dev/api/cancel?id=${bookingId}`;

  const customerMail = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: "Nubi Mainz <reservierung@nubimainz.de>",
      to: [email],
      subject: "Deine Reservierung bei Nubi Mainz 💗",
      html: `
        <h2>Deine Reservierung ist bestätigt 💗</h2>
        <p><strong>Datum:</strong> ${date}</p>
        <p><strong>Uhrzeit:</strong> ${time}</p>
        <p><strong>Personen:</strong> ${personen}</p>
        <p><strong>Name:</strong> ${name}</p>
        <p>Wir freuen uns auf dich!</p>
        <p><a href="${cancelUrl}">Reservierung stornieren</a></p>
      `
    })
  });

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: "Nubi Mainz <reservierung@nubimainz.de>",
      to: ["nubimainz@gmail.com"],
      subject: `Neue Reservierung – ${date} ${time}`,
      html: `
        <h2>Neue Reservierung</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Datum:</strong> ${date}</p>
        <p><strong>Uhrzeit:</strong> ${time}</p>
        <p><strong>Personen:</strong> ${personen}</p>
        <p><strong>E-Mail:</strong> ${email}</p>
        <p><strong>Telefon:</strong> ${phone}</p>
        <p><strong>Notiz:</strong> ${note || "-"}</p>
      `
    })
  });

  emailSent = customerMail.ok;
}
    const cache = caches.default;
const availabilityUrl =
  new URL(`/api/availability?date=${date}`, context.request.url).toString();

await cache.delete(availabilityUrl);
          

return json({
      success: true,
      bookingId,
      recordId: record.id,
      message: "Reservierung erfolgreich."
    });

  } catch (error) {
    console.error(error);
    return json(
  { error: "Reservierung konnte nicht verarbeitet werden." },
  500
);

  }
}
