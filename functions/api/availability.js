const BASE_ID = "appp9KaXdhwJ3H85L";
const BOOKINGS_TABLE = "tblXP5bZB9nCbIYfP";
const BLOCKED_TABLE = "tblixvX34OWlZcb38";
const TIMES_TABLE = "tbl2qWLmxSohKekMr";

const CAPACITY = 8;
const CALENDLY_DURATION = 90;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

async function airtableList(env, table, formula = "") {
  let url = `https://api.airtable.com/v0/${BASE_ID}/${table}`;

  if (formula) {
    url += `?filterByFormula=${encodeURIComponent(formula)}`;
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${env.AIRTABLE_TOKEN}`
    }
  });

  if (!response.ok) {
    throw new Error("Airtable-Abfrage fehlgeschlagen");
  }

  const data = await response.json();
  return data.records || [];
}

function germanWeekday(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);

  const weekdays = [
    "Sonntag",
    "Montag",
    "Dienstag",
    "Mittwoch",
    "Donnerstag",
    "Freitag",
    "Samstag"
  ];

  return weekdays[
    new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  ];
}

function toMinutes(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function overlapsCalendly(time, calendlyRecords) {
  const slotStart = toMinutes(time);

  return calendlyRecords.some(record => {
    const calendlyTime = record.fields.Uhrzeit;

    if (!calendlyTime) return false;

    const start = toMinutes(calendlyTime);
    const end = start + CALENDLY_DURATION;

    // Die exakte Calendly-Uhrzeit darf angezeigt werden,
    // wenn dort noch Plätze frei sind.
    if (slotStart === start) return false;

    return slotStart > start - CALENDLY_DURATION &&
           slotStart < end;
  });
}

export async function onRequestGet(context) {
  try {
    const { request, env } = context;

    const url = new URL(request.url);
    const date = url.searchParams.get("date");

    if (!date) {
      return json({ error: "Datum fehlt." }, 400);
    }

    if (!env.AIRTABLE_TOKEN) {
      return json({ error: "AIRTABLE_TOKEN fehlt." }, 500);
    }

    const weekday = germanWeekday(date);

    // Neue Reservierungen
    const bookings = await airtableList(
      env,
      BOOKINGS_TABLE,
      `AND({Datum}='${date}',{Status}='Bestätigt')`
    );

    // Alte Calendly- und sonstige Sperren
    const blocked = await airtableList(
      env,
      BLOCKED_TABLE,
      `{Datum}='${date}'`
    );

    const calendlyRecords = blocked.filter(record => {
      const grund = String(record.fields.Grund || "").toLowerCase();
      return grund.includes("calendly");
    });

    // Normale Zeiten, die du später am Handy ändern kannst
    const schedule = await airtableList(
      env,
      TIMES_TABLE,
      `AND({WochenTag}='${weekday}',{Aktiv}=1)`
    );

    const normalTimes = schedule
      .map(record => record.fields.Uhrzeit)
      .filter(Boolean)
      .filter(time => !overlapsCalendly(time, calendlyRecords));

    // Tatsächliche alte Calendly-Uhrzeiten ebenfalls übernehmen
    const calendlyTimes = calendlyRecords
      .map(record => record.fields.Uhrzeit)
      .filter(Boolean);

    const candidateTimes = [
      ...new Set([...normalTimes, ...calendlyTimes])
    ].sort((a, b) => a.localeCompare(b));

    const times = candidateTimes.map(time => {
      const bookedSeats = bookings
        .filter(record => record.fields.Uhrzeit === time)
        .reduce(
          (sum, record) =>
            sum + Number(record.fields.Personen || 0),
          0
        );

      const blockedSeats = blocked
        .filter(record => record.fields.Uhrzeit === time)
        .reduce(
          (sum, record) =>
            sum +
            Number(record.fields["Gesperrte Plätze"] || 0),
          0
        );

      const used = Math.min(
        CAPACITY,
        bookedSeats + blockedSeats
      );

      const remaining = Math.max(
        0,
        CAPACITY - used
      );

      return {
        time,
        capacity: CAPACITY,
        used,
        remaining,
        available: remaining > 0
      };
    });

    return json({
      date,
      weekday,
      times: times.filter(slot => slot.available)
    });

  } catch (error) {
    console.error(error);

    return json(
      { error: "Verfügbarkeit konnte nicht geladen werden." },
      500
    );
  }
}
