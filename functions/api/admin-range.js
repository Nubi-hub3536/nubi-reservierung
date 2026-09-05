function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseDate(value) {
  return new Date(`${value}T12:00:00`);
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
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
    const startDate = String(body.startDate || "").trim();
    const endDate = String(body.endDate || "").trim();
    const reason = String(body.reason || "").trim();

    if (!env.ADMIN_PIN || pin !== env.ADMIN_PIN) {
      return json(
        { error: "Falsche Admin-PIN." },
        401
      );
    }

    if (
      !isValidDate(startDate) ||
      !isValidDate(endDate)
    ) {
      return json(
        { error: "Start- oder Enddatum ist ungültig." },
        400
      );
    }

    const start = parseDate(startDate);
    const end = parseDate(endDate);

    if (start > end) {
      return json(
        { error: "Das Enddatum muss nach dem Startdatum liegen." },
        400
      );
    }

    const maxDays = 366;

    const diffDays =
      Math.floor(
        (end.getTime() - start.getTime()) /
        (1000 * 60 * 60 * 24)
      ) + 1;

    if (diffDays > maxDays) {
      return json(
        { error: "Der Zeitraum darf maximal 366 Tage lang sein." },
        400
      );
    }

    let current = new Date(start.getTime());
    let count = 0;

    while (current <= end) {
      const date = formatDate(current);

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
          reason || "Urlaub"
        )
        .run();

      count++;

      current.setDate(current.getDate() + 1);
    }

    return json({
      success: true,
      message: `${count} Tage wurden geschlossen.`,
      count
    });

  } catch (error) {
    console.error(error);

    return json(
      {
        error: "Zeitraum konnte nicht geschlossen werden.",
        details: error?.message || String(error)
      },
      500
    );
  }
} export async function onRequestDelete(context) {
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

    const startDate = String(
      url.searchParams.get("startDate") || ""
    ).trim();

    const endDate = String(
      url.searchParams.get("endDate") || ""
    ).trim();

    if (!env.ADMIN_PIN || pin !== env.ADMIN_PIN) {
      return json(
        { error: "Falsche Admin-PIN." },
        401
      );
    }

    if (
      !isValidDate(startDate) ||
      !isValidDate(endDate)
    ) {
      return json(
        { error: "Start- oder Enddatum ist ungültig." },
        400
      );
    }

    const start = parseDate(startDate);
    const end = parseDate(endDate);

    if (start > end) {
      return json(
        { error: "Das Enddatum muss nach dem Startdatum liegen." },
        400
      );
    }

    const maxDays = 366;

    const diffDays =
      Math.floor(
        (end.getTime() - start.getTime()) /
        (1000 * 60 * 60 * 24)
      ) + 1;

    if (diffDays > maxDays) {
      return json(
        { error: "Der Zeitraum darf maximal 366 Tage lang sein." },
        400
      );
    }

    const result = await env.DB
      .prepare(`
        DELETE FROM closed_days
        WHERE date >= ?
          AND date <= ?
      `)
      .bind(
        startDate,
        endDate
      )
      .run();

    return json({
      success: true,
      message: "Zeitraum wurde wieder geöffnet.",
      count: result.meta?.changes || 0
    });

  } catch (error) {
    console.error(error);

    return json(
      {
        error: "Zeitraum konnte nicht geöffnet werden.",
        details: error?.message || String(error)
      },
      500
    );
  }
}
