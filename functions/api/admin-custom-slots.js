function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    if (!env.DB) {
      return json({ error: "Datenbank nicht verbunden." }, 500);
    }

    const body = await request.json();

    const pin = String(body.pin || "").trim();
    const date = String(body.date || "").trim();
    const slots = Array.isArray(body.slots) ? body.slots : [];

    if (!env.ADMIN_PIN || pin !== env.ADMIN_PIN) {
      return json({ error: "Falsche Admin-PIN." }, 401);
    }

    if (!date) {
      return json({ error: "Datum fehlt." }, 400);
    }

    if (slots.length === 0) {
      return json({ error: "Bitte mindestens eine Uhrzeit angeben." }, 400);
    }

    // Vorhandene eigenen Zeiten dieses Tages entfernen
    await env.DB
      .prepare("DELETE FROM custom_slots WHERE date = ?")
      .bind(date)
      .run();

    // Neue Zeiten speichern
    for (const slot of slots) {
      const time = String(slot.time || "").trim();
      const capacity = Number(slot.capacity);

      if (
        !/^\d{2}:\d{2}$/.test(time) ||
        !Number.isInteger(capacity) ||
        capacity < 1 ||
        capacity > 30
      ) {
        return json(
          { error: "Uhrzeit oder Personenanzahl ist ungültig." },
          400
        );
      }

      await env.DB
        .prepare(`
          INSERT INTO custom_slots
            (date, time, capacity, is_closed)
          VALUES (?, ?, ?, 0)
        `)
        .bind(date, time, capacity)
        .run();
    }

    return json({
      success: true,
      message: "Eigene Termine wurden gespeichert."
    });

  } catch (error) {
    console.error(error);

    return json(
      {
        error: "Speichern nicht möglich.",
        details: error?.message || String(error)
      },
      500
    );
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;

  try {
    const url = new URL(request.url);

    const pin = String(url.searchParams.get("pin") || "").trim();
    const date = String(url.searchParams.get("date") || "").trim();

    if (!env.ADMIN_PIN || pin !== env.ADMIN_PIN) {
      return json({ error: "Falsche Admin-PIN." }, 401);
    }

    if (!date) {
      return json({ error: "Datum fehlt." }, 400);
    }

    await env.DB
      .prepare("DELETE FROM custom_slots WHERE date = ?")
      .bind(date)
      .run();

    return json({
      success: true,
      message: "Eigene Zeiten entfernt. Standardzeiten gelten wieder."
    });

  } catch (error) {
    return json({ error: "Zurücksetzen nicht möglich." }, 500);
  }
}
