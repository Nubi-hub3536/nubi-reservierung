function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

export async function onRequestGet(context) {
  const { env } = context;

  const envNames = Object.keys(env || {}).sort();

  const calendarRelatedVariables =
    envNames.filter(name =>
      /google|calendar|ical/i.test(name)
    );

  return json({
    success: true,
    googleCalendarVariablePresent:
      Boolean(env.GOOGLE_CALENDAR_ICAL_URL),
    calendarRelatedVariables
  });
}
