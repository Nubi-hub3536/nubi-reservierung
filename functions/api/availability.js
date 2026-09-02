const BASE_ID = "appp9KaXdhwJ3H85L";

const BOOKINGS_TABLE = "tblXP5bZB9nCbIYfP";
const BLOCKED_TABLE = "tblixvX34OWlZcb38";
const TIMES_TABLE = "tbl2qWLmxSohKekMr";

const CAPACITY = 8;

const weekdayNames = [
  "Sonntag",
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

async function airtableList(env, tableId, params = {}) {
  const url = new URL(
    `https://api.airtable.com/v0/${BASE_ID}/${tableId}`
  );

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${env.AIRTABLE_TOKEN}`,
    },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const data = await response.json();
  return data.records || [];
}

export async function onRequestGet(context) {
  try {
    const { request, env } = context;

    if (!env.AIRTABLE_TOKEN) {
      return json({ error: "AIRTABLE_TOKEN fehlt." }, 500);
    }

    const url = new URL(request.url);
    const date = url.searchParams.get("date");

    if (!date) {
      return json({ error: "Datum fehlt." }, 400);
    }

    const selectedDate = new Date(`${date}T12:00:00`);
    const weekday = weekdayNames[selectedDate.getDay()];

    if (weekday === "Sonntag") {
      return json({
        date,
        weekday,
        times: [],
      });
    }

    const timeRows = await airtableList(env, TIMES_TABLE);

    const activeTimes = timeRows
      .filter((record) => {
        const fields = record.fields || {};

        return (
          fields["WochenTag"] === weekday &&
          Number(fields["Aktiv"]) === 1 &&
          fields["Uhrzeit"]
        );
      })
      .map((record) => record.fields["Uhrzeit"])
      .sort();

    if (activeTimes.length === 0) {
      return json({
        date,
        weekday,
        times: [],
      });
    }

    const bookingFormula =
      `AND({Datum}='${date}',{Status}='Bestätigt')`;

    const blockedFormula =
      `{Datum}='${date}'`;

    const [bookings, blocked] = await Promise.all([
      airtableList(env, BOOKINGS_TABLE, {
        filterByFormula: bookingFormula,
      }),
      airtableList(env, BLOCKED_TABLE, {
        filterByFormula: blockedFormula,
      }),
    ]);

    const result = activeTimes.map((time) => {
      const bookedSeats = bookings
        .filter((record) => record.fields?.["Uhrzeit"] === time)
        .reduce(
          (sum, record) =>
            sum + Number(record.fields?.["Personen"] || 0),
          0
        );

      const blockedSeats = blocked
        .filter((record) => record.fields?.["Uhrzeit"] === time)
        .reduce(
          (sum, record) =>
            sum +
            Number(record.fields?.["Gesperrte Plätze"] || 0),
          0
        );

      const used = bookedSeats + blockedSeats;
      const remaining = Math.max(0, CAPACITY - used);

      return {
        time,
        capacity: CAPACITY,
        used,
        remaining,
        available: remaining > 0,
      };
    });

    return json({
      date,
      weekday,
      times: result,
    });
  } catch (error) {
    console.error(error);

    return json(
      {
        error: "Verfügbarkeit konnte nicht geladen werden.",
      },
      500
    );
  }
}
