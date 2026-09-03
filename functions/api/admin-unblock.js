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
    const pin = String(body.pin || "");

    if (!env.ADMIN_PIN || pin !== env.ADMIN_PIN) {
      return json({ error: "Admin-PIN ist nicht korrekt." }, 401);
    }

    if (!date || !time) {
      return json({ error: "Bitte Datum und Uhrzeit auswählen." }, 400);
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

    if (checkData.records.length === 0) {
      return json(
        { error: "Für diesen Termin wurde keine manuelle Sperre gefunden." },
        404
      );
    }

    for (const record of checkData.records) {
      const remove = await fetch(
        `https://api.airtable.com/v0/${BASE_ID}/${BLOCKED_TABLE}/${record.id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${env.AIRTABLE_TOKEN}`
          }
        }
      );

      if (!remove.ok) {
        return json({ error: "Termin konnte nicht freigegeben werden." }, 500);
      }
    }
const cache = caches.default;
const availabilityUrl =
  new URL(`/api/availability?date=${date}`, context.request.url).toString();

await cache.delete(availabilityUrl);
    return json({
      success: true,
      message: "Termin wurde wieder freigegeben."
    });

  } catch (error) {
    return json({ error: "Es ist ein Fehler aufgetreten." }, 500);
  }
}
