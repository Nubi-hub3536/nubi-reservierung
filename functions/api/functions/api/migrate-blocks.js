const BASE_ID = "appp9KaXdhwJ3H85L";
const BLOCKED_TABLE = "tblixvX34OWlZcb38";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();

    if (!body.pin || body.pin !== env.ADMIN_PIN) {
      return json({ error: "Nicht erlaubt." }, 401);
    }

    if (!env.DB) {
      return json({ error: "D1-Datenbank nicht verbunden." }, 500);
    }

    if (!env.AIRTABLE_TOKEN) {
      return json({ error: "Airtable-Zugang fehlt." }, 500);
    }

    let records = [];
    let offset = null;

    do {
      const params = new URLSearchParams();
      params.append("pageSize", "100");

      if (offset) {
        params.append("offset", offset);
      }

      const response = await fetch(
        `https://api.airtable.com/v0/${BASE_ID}/${BLOCKED_TABLE}?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${env.AIRTABLE_TOKEN}`
          }
        }
      );

      if (!response.ok) {
        throw new Error("Airtable konnte nicht gelesen werden.");
      }

      const data = await response.json();

      records.push(...(data.records || []));
      offset = data.offset || null;
    } while (offset);

    const validRecords = records.filter(record => {
      const fields = record.fields || {};

      return (
        fields.Datum &&
        fields.Uhrzeit &&
        Number(fields["Gesperrte Plätze"]) > 0
      );
    });

    await env.DB.prepare("DELETE FROM blocked_slots").run();

    const statements = validRecords.map(record => {
      const fields = record.fields;

      return env.DB
        .prepare(`
          INSERT INTO blocked_slots
            (date, time, blocked_seats, reason)
          VALUES (?, ?, ?, ?)
        `)
        .bind(
          fields.Datum,
          fields.Uhrzeit,
          Number(fields["Gesperrte Plätze"]),
          fields.Grund || "Übernommen aus Airtable"
        );
    });

    for (let i = 0; i < statements.length; i += 50) {
      await env.DB.batch(statements.slice(i, i + 50));
    }

    return json({
      success: true,
      imported: validRecords.length,
      ignored: records.length - validRecords.length
    });
  } catch (error) {
    console.error(error);

    return json(
      { error: "Migration konnte nicht durchgeführt werden." },
      500
    );
  }
}
