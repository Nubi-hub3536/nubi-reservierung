function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8"
    }
  });
}

export async function onRequestPost(context) {
  const { env, request } = context;

  try {
    const body = await request.json();

    const date = String(body.date || "");
    const time = String(body.time || "");
    const pin = String(body.pin || "");

    if (!env.ADMIN_PIN || pin !== env.ADMIN_PIN) {
      return json({ error: "Admin-PIN ist nicht korrekt." }, 401);
    }

    if (!date || !time) {
      return json(
        { error: "Bitte Datum und Uhrzeit auswählen." },
        400
      );
    }

    const existing = await env.DB
      .prepare(`
        SELECT id
        FROM blocked_slots
        WHERE date = ?
          AND time = ?
          AND reason = 'Admin – manuell gesperrt'
      `)
      .bind(date, time)
      .all();

    if (!existing.results || existing.results.length === 0) {
      return json(
        { error: "Für diesen Termin wurde keine manuelle Sperre gefunden." },
        404
      );
    }

    await env.DB
      .prepare(`
        DELETE FROM blocked_slots
        WHERE date = ?
          AND time = ?
          AND reason = 'Admin – manuell gesperrt'
      `)
      .bind(date, time)
      .run();

    return json({
      success: true,
      message: "Termin wurde wieder freigegeben."
    });

  } catch (error) {
    console.error(error);

    return json(
      { error: "Es ist ein Fehler aufgetreten." },
      500
    );
  }
}
