export async function onRequestGet(context) {
  const { env } = context;

  if (!env.DB) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "D1-Datenbank nicht verbunden."
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }

  try {
    // Reservierungen löschen, deren Termin länger als 7 Tage vorbei ist.
    // date wird in D1 als YYYY-MM-DD gespeichert.
    const result = await env.DB
      .prepare(`
        DELETE FROM bookings
        WHERE date < date('now', '-7 days')
      `)
      .run();

    return new Response(
      JSON.stringify({
        success: true,
        deleted: result.meta?.changes ?? 0
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}
