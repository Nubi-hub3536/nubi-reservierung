function formatDateUTC(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addDaysUTC(date, days) {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function getEasterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);

  const h =
    (19 * a + b - d - g + 15) % 30;

  const i = Math.floor(c / 4);
  const k = c % 4;

  const l =
    (32 + 2 * e + 2 * i - h - k) % 7;

  const m =
    Math.floor((a + 11 * h + 22 * l) / 451);

  const month =
    Math.floor((h + l - 7 * m + 114) / 31);

  const day =
    ((h + l - 7 * m + 114) % 31) + 1;

  return new Date(
    Date.UTC(year, month - 1, day)
  );
}

export function getRlpHolidays(year) {
  const easter = getEasterSunday(year);

  return [
    {
      date: `${year}-01-01`,
      name: "Neujahr"
    },
    {
      date: formatDateUTC(
        addDaysUTC(easter, -2)
      ),
      name: "Karfreitag"
    },
    {
      date: formatDateUTC(
        addDaysUTC(easter, 1)
      ),
      name: "Ostermontag"
    },
    {
      date: `${year}-05-01`,
      name: "Tag der Arbeit"
    },
    {
      date: formatDateUTC(
        addDaysUTC(easter, 39)
      ),
      name: "Christi Himmelfahrt"
    },
    {
      date: formatDateUTC(
        addDaysUTC(easter, 50)
      ),
      name: "Pfingstmontag"
    },
    {
      date: formatDateUTC(
        addDaysUTC(easter, 60)
      ),
      name: "Fronleichnam"
    },
    {
      date: `${year}-10-03`,
      name: "Tag der Deutschen Einheit"
    },
    {
      date: `${year}-11-01`,
      name: "Allerheiligen"
    },
    {
      date: `${year}-12-25`,
      name: "1. Weihnachtstag"
    },
    {
      date: `${year}-12-26`,
      name: "2. Weihnachtstag"
    }
  ];
}

export function getRlpHoliday(dateString) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return null;
  }

  const year = Number(dateString.slice(0, 4));

  return (
    getRlpHolidays(year).find(
      holiday => holiday.date === dateString
    ) || null
  );
}

export function isRlpHoliday(dateString) {
  return Boolean(getRlpHoliday(dateString));
}
