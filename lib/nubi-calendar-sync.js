export async function syncNubiCalendar(env, booking, action = "create") {
  if (!env.GOOGLE_CALENDAR_WEBAPP_URL || !env.NUBI_SYNC_SECRET) {
    console.warn("Nubi-Kalender: Einstellungen fehlen.");
    return false;
  }

  try {
    const response = await fetch(env.GOOGLE_CALENDAR_WEBAPP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=UTF-8"
      },
      body: JSON.stringify({
        secret: env.NUBI_SYNC_SECRET,
        action,
        id: booking.id,
        name: booking.name,
        date: booking.date,
        time: booking.time,
        persons: booking.persons,
        note: booking.note || ""
      }),
      redirect: "follow"
    });

    const text = await response.text();
    let result;

    try {
      result = JSON.parse(text);
    } catch {
      result = null;
    }

    if (!response.ok || result?.success !== true) {
      console.error("Kalender-Synchronisierung fehlgeschlagen.");
      return false;
    }

    return true;
  } catch (error) {
    console.error("Kalenderfehler:", error);
    return false;
  }
}
