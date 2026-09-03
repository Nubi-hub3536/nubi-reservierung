const BASE_ID = "appp9KaXdhwJ3H85L";
const BLOCKED_TABLE = "tblixvX34OWlZcb38";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8"
    }
  });
}

export async function onRequestPost(context) {
  const env = context.env;

  try {
    const body = await context.request.json();

    const date = String(body.date || "");
    const time = String(body.time || "");
    const seats = Number(body.seats);
    const pin = String(body.pin || "");

    if (!env.ADMIN_PIN || pin !== env.ADMIN_PIN) {
      return json({ error: "Admin-PIN ist nicht korrekt." }, 401);
    }

    if (!date || !time || !Number.isInteger(seats) || seats < 1 || seats > 8) {
      return json({ error: "Bitte gültiges Datum, Uhrzeit und Plätze auswählen." }, 400);
    }

    const formula =
      `AND(DATETIME_FORMAT({Datum}, 'YYYY-MM-DD')='${date}',{Uhrzeit}='${time}',{Grund}='Admin – manuell gesperrt')`;

    const check = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${BLOCKED_TABLE}?filterByFormula=${encodeURIComponent(formula)}`,
      {
        headers: {
          Authorization: `Bearer ${env.AIRTABLE_TOKEN}`
        }
      }
    );

    if (!check.ok) {
      return json({ error: "Airtable konnte nicht geprüft werden." }, 500);
    }

    const checkData = await check.json();

    const fields = {
      Sperre: `Admin ${date} ${time}`,
      Datum: date,
      Uhrzeit: time,
      "Gesperrte Plätze": seats,
      Grund: "Admin – manuell gesperrt"
    };

    if (checkData.records.length > 0) {
      const recordId = checkData.records[0].id;

      const update = await fetch(
        `https://api.airtable.com/v0/${BASE_ID}/${BLOCKED_TABLE}/${recordId}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${env.AIRTABLE_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ fields })
        }
      );

      if (!update.ok) {
        return json({ error: "Sperre konnte nicht geändert werden." }, 500);
      }
    } else {
      const create = await fetch(
        `https://api.airtable.com/v0/${BASE_ID}/${BLOCKED_TABLE}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.AIRTABLE_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ fields })
        }
      );

      if (!create.ok) {
        return json({ error: "Sperre konnte nicht gespeichert werden." }, 500);
      }
    }

    return json({
      success: true,
      message: "Termin wurde gespeichert."
    });

  } catch (error) {
    return json({ error: "Es ist ein Fehler aufgetreten." }, 500);
  }
}
