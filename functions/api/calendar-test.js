export async function onRequestGet({ env }) {
  const checks = {
    database: !!env.DB,
    calendarUrl: !!env.GOOGLE_CALENDAR_WEBAPP_URL,
    calendarCredentials: !!env.GOOGLE_SERVICE_ACCOUNT_JSON
  };

  return new Response(JSON.stringify({
    success: true,
    checks,
    message: "Nur Konfigurationsprüfung. Kein Kalendereintrag erstellt."
  }, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}
