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
      return json(
        { error: "Datenbank nicht verbunden." },
        500
      );
    }

    const body = await request.json();

    const pin = String(body.pin || "").trim();
    const date = String(body.date || "").trim();
    const reason = String(body.reason || "").trim();

    if (!env.ADMIN_PIN || pin !== env.ADMIN_PIN) {
      return json(
        { error: "Falsche Admin-PIN." },
        401
      );
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return json(
        { error: "Datum ist ungültig." },
        400
      );
    }

    await env.DB
      .prepare(`
        INSERT INTO closed_days (
          date,
          reason
        )
        VALUES (?, ?)
        ON CONFLICT(date)
        DO UPDATE SET
          reason = excluded.reason
      `)
      .bind(
        date,
        reason || "Manuell geschlossen"
      )
      .run();

    return json({
      success: true,
      message: "Tag wurde geschlossen."
    });

  } catch (error) {
    console.error(error);

    return json(
      {
        error: "Tag konnte nicht geschlossen werden.",
        details: error?.message || String(error)
      },
      500
    );
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;

  try {
    if (!env.DB) {
      return json(
        { error: "Datenbank nicht verbunden." },
        500
      );
    }

    const url = new URL(request.url);

    const pin = String(
      url.searchParams.get("pin") || ""
    ).trim();

    const date = String(
      url.searchParams.get("date") || ""
    ).trim();

    if (!env.ADMIN_PIN || pin !== env.ADMIN_PIN) {
      return json(
        { error: "Falsche Admin-PIN." },
        401
      );
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return json(
        { error: "Datum ist ungültig." },
        400
      );
    }

    await env.DB
      .prepare(`
        DELETE FROM closed_days
        WHERE date = ?
      `)
      .bind(date)
      .run();

    return json({
      success: true,
      message: "Tag wurde wieder geöffnet."
    });

  } catch (error) {
    console.error(error);

    return json(
      {
        error: "Tag konnte nicht geöffnet werden.",
        details: error?.message || String(error)
      },
      500
    );
  }
}
