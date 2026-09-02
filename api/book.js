import {
  CAPACITY,
  schedule,
  localDay,
  seatsUsed,
  createBooking
} from "./common.js";

const FROM = "Nubi Mainz <reservierung@nubimainz.de>";
const OWNER_EMAIL = "nubimainz@gmail.com";

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function sendEmail({ to, subject, html }) {
  const key = process.env.RESEND_API_KEY;

  if (!key) throw new Error("RESEND_API_KEY fehlt");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
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
    const text = await response.text();
    throw new Error(`Resend Fehler: ${text}`);
  }

  return response.json();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Methode nicht erlaubt"
    });
  }

  try {
    const b = req.body || {};

    const required = [
      "name",
      "email",
      "phone",
      "date",
      "time",
      "people"
    ];

    for (const field of required) {
      if (!b[field]) {
        return res.status(400).json({
          error: `${field} fehlt`
        });
      }
    }

    b.people = Number(b.people);

    if (
      !Number.isInteger(b.people) ||
      b.people < 1 ||
      b.people > 8
    ) {
      return res.status(400).json({
        error: "Personenzahl ungültig"
      });
    }

    const times = schedule[localDay(b.date)] || [];

    if (!times.includes(b.time)) {
      return res.status(400).json({
        error: "Dieser Termin ist nicht buchbar"
      });
    }

    if (
      !b.cashAccepted ||
      !b.phoneChecked ||
      !b.safetyAccepted
    ) {
      return res.status(400).json({
        error: "Bitte alle Pflicht-Hinweise bestätigen"
      });
    }

    const used = await seatsUsed(b.date, b.time);
    const remaining = Math.max(0, CAPACITY - used);

    if (b.people > remaining) {
      return res.status(409).json({
        error: `Es sind nur noch ${remaining} Plätze frei.`
      });
    }

    const created = await createBooking(b);

    let emailSent = true;

    try {
      await sendEmail({
        to: b.email,
        subject: "Deine Reservierung bei Nubi Mainz ✨",
        html: `
          <h2>Deine Reservierung bei Nubi Mainz</h2>
          <p>Hallo ${esc(b.name)},</p>
          <p>deine Reservierung ist bestätigt. 💕</p>

          <p>
            <strong>Datum:</strong> ${esc(b.date)}<br>
            <strong>Uhrzeit:</strong> ${esc(b.time)} Uhr<br>
            <strong>Personen:</strong> ${b.people}
          </p>

          <p><strong>Bitte beachten:</strong></p>
          <p>Bei uns ist ausschließlich Barzahlung möglich.</p>

          <p>
            Falls dein Handymodell nicht auf unserer Website
            aufgeführt ist, kannst du eine eigene transparente
            Handyhülle mitbringen und 5 € sparen.
          </p>

          <p>
            Sicherheits- und Materialhinweise:
            www.nubimainz.de
          </p>

          ${
            b.note
              ? `<p><strong>Deine Notiz:</strong><br>${esc(b.note)}</p>`
              : ""
          }

        <p>
  Falls du deinen Termin nicht wahrnehmen kannst, kannst du deine
  Reservierung hier stornieren:
</p>

<p>
  <a href="https://nubi-reservierung.vercel.app/api/cancel?id=${created.bookingId}">
    Reservierung stornieren
  </a>
</p>  <p>
            Wir freuen uns auf dich! ✨<br>
            <strong>Nubi Mainz</strong>
          </p>
        `
      });

      await sendEmail({
        to: OWNER_EMAIL,
        subject:
          `Neue Reservierung – ${b.date} ${b.time} Uhr – ${b.people} Person(en)`,
        html: `
          <h2>Neue Nubi-Reservierung 🎀</h2>

          <p>
            <strong>Name:</strong> ${esc(b.name)}<br>
            <strong>E-Mail:</strong> ${esc(b.email)}<br>
            <strong>Telefon:</strong> ${esc(b.phone)}<br><br>
            <strong>Datum:</strong> ${esc(b.date)}<br>
            <strong>Uhrzeit:</strong> ${esc(b.time)} Uhr<br>
            <strong>Personen:</strong> ${b.people}
          </p>

          ${
            b.note
              ? `<p><strong>Notiz:</strong><br>${esc(b.note)}</p>`
              : "<p><strong>Notiz:</strong> Keine</p>"
          }
        `
      });
    } catch (emailError) {
      emailSent = false;
      console.error(
        "E-Mail konnte nicht versendet werden:",
        emailError
      );
    }

    return res.status(200).json({
      ok: true,
      id: created?.airtable?.records?.[0]?.id || null,
      remaining: CAPACITY - used - b.people,
      emailSent
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Reservierung konnte nicht gespeichert werden."
    });
  }
}
