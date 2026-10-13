/**
 * NUBI MAINZ – Google-Kalender-Verbindungstest
 *
 * Prüft:
 * - Cloudflare-Datenbank ist verbunden
 * - Neue Google-Apps-Script-URL ist vorhanden
 * - Sicherheitsschlüssel ist hinterlegt
 * - Google Apps Script antwortet korrekt
 *
 * Erstellt, verändert und löscht keine Buchungen.
 * Erstellt, verändert und löscht keine Kalendereinträge.
 * Versendet keine E-Mails.
 */

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

export async function onRequestGet({ env }) {
  const checks = {
    database: Boolean(env.DB),
    calendarUrl: Boolean(env.GOOGLE_CALENDAR_WEBAPP_URL),
    syncSecret: Boolean(
      env.NUBI_SYNC_SECRET &&
      env.NUBI_SYNC_SECRET.length >= 32
    ),
    googleScriptReachable: false
  };

  const url = String(
    env.GOOGLE_CALENDAR_WEBAPP_URL || ""
  ).trim();

  const validUrl =
    /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(url);

  if (!validUrl) {
    return json({
      success: false,
      checks,
      message: "Die Google-Apps-Script-URL fehlt oder ist ungültig."
    }, 503);
  }

  if (!checks.syncSecret) {
    return json({
      success: false,
      checks,
      message: "Der Nubi-Sicherheitsschlüssel fehlt oder ist zu kurz."
    }, 503);
  }

  if (!checks.database) {
    return json({
      success: false,
      checks,
      message: "Die Cloudflare-Datenbank ist nicht verbunden."
    }, 503);
  }

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "Accept": "application/json"
      },
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      return json({
        success: false,
        checks,
        message: "Google Apps Script antwortet mit einem Fehler.",
        httpStatus: response.status
      }, 503);
    }

    let result;

    try {
      result = await response.json();
    } catch (error) {
      return json({
        success: false,
        checks,
        message: "Die Antwort von Google Apps Script ist kein gültiges JSON."
      }, 503);
    }

    checks.googleScriptReachable = Boolean(
      result &&
      result.success === true &&
      result.dienst === "Nubi Kalender" &&
      result.status === "online"
    );

    if (!checks.googleScriptReachable) {
      return json({
        success: false,
        checks,
        message: "Google Apps Script ist erreichbar, aber antwortet nicht wie erwartet."
      }, 503);
    }

    return json({
      success: true,
      checks,
      message: "Nubi Cloudflare und Google Apps Script sind erreichbar. Der Sicherheitsschlüssel ist vorhanden.",
      note: "Die tatsächliche Buchungs- und Stornierungssynchronisierung muss separat getestet werden."
    });

  } catch (error) {
    console.error(
      "Nubi-Kalender-Verbindungstest:",
      error
    );

    return json({
      success: false,
      checks,
      message: "Cloudflare konnte Google Apps Script nicht erreichen."
    }, 503);
  }
}
