const BASE_ID = "appp9KaXdhwJ3H85L";
const BOOKINGS_TABLE = "tblXP5bZB9nCbIYfP";
const BLOCKED_TABLE = "tblixvX34OWlZcb38";

export const CAPACITY = 8;

export const schedule = {
  1: ["13:00", "15:00", "17:00"],
  2: ["13:00", "15:00", "17:00"],
  3: ["13:00", "15:00", "17:00"],
  4: ["13:00", "15:00", "17:00"],
  5: ["13:00", "15:00", "17:00"],
  6: ["11:00", "13:00", "15:00", "17:00"]
};

function token() {
  if (!process.env.AIRTABLE_TOKEN) {
    throw new Error("AIRTABLE_TOKEN fehlt");
  }
  return process.env.AIRTABLE_TOKEN;
}

export function localDay(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

async function airtableList(tableId, params = {}) {
  const url = new URL(
    `https://api.airtable.com/v0/${BASE_ID}/${tableId}`
  );

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token()}`
    }
  });

  if (!response.ok) {
    throw new Error(
      `Airtable Fehler ${response.status}: ${await response.text()}`
    );
  }

  return response.json();
}

export async function listAll(tableId, filterByFormula) {
  const out = [];
  let offset;

  do {
    const params = {
      pageSize: "100"
    };

    if (filterByFormula) {
      params.filterByFormula = filterByFormula;
    }

    if (offset) {
      params.offset = offset;
    }

    const data = await airtableList(tableId, params);

    out.push(...(data.records || []));
    offset = data.offset;
  } while (offset);

  return out;
}

export async function seatsUsed(date, time) {
  const dateFormula =
    `DATETIME_FORMAT({Datum},'YYYY-MM-DD')='${date}'`;

  const bookingFormula =
    `AND(${dateFormula},{Uhrzeit}='${time}',{Status}='Bestätigt')`;

  const blockedFormula =
    `AND(${dateFormula},{Uhrzeit}='${time}')`;

  const [bookings, blocked] = await Promise.all([
    listAll(BOOKINGS_TABLE, bookingFormula),
    listAll(BLOCKED_TABLE, blockedFormula)
  ]);

  const bookedSeats = bookings.reduce(
    (sum, record) =>
      sum + Number(record.fields?.Personen || 0),
    0
  );

  const blockedSeats = blocked.reduce(
    (sum, record) =>
      sum + Number(record.fields?.["Gesperrte Plätze"] || 0),
    0
  );

  return bookedSeats + blockedSeats;
}

export async function createBooking(fields) {
  const response = await fetch(
    `https://api.airtable.com/v0/${BASE_ID}/${BOOKINGS_TABLE}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token()}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        records: [{ fields }]
      })
    }
  );

  if (!response.ok) {
    throw new Error(
      `Airtable Fehler ${response.status}: ${await response.text()}`
    );
  }

  return response.json();
}
