import { getShiftSummaryForDate } from "../../lib/calendar-shift.js";
import {
  getShiftType,
  getNewBookingTimes
} from "../../lib/work-schedule.js";

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
  const { request, env } = context;

  try {
    const url = new URL(request.url);
    const date = url.searchParams.get("date");

    if (!date) {
      return json(
        {
          error: "Datum fehlt.",
          example:
            "/api/calendar-test?date=2026-09-17"
        },
        400
      );
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return json(
        {
          error:
            "Datum muss im Format YYYY-MM-DD sein."
        },
        400
      );
    }

    const shiftSummary =
      await getShiftSummaryForDate(env, date);

    const weekday = new Date(
      `${date}T12:00:00`
    ).toLocaleDateString("de-DE", {
      weekday: "long",
      timeZone: "Europe/Berlin"
    });

    const shiftType =
      getShiftType(shiftSummary);

    const bookingTimes =
      getNewBookingTimes(
        weekday,
        shiftSummary
      );

    return json({
      success: true,
      calendarConnected: true,
      date,
      weekday,
      shiftSummary,
      shiftType,
      bookingTimes
    });
  } catch (error) {
    console.error(error);

    return json(
      {
        success: false,
        calendarConnected: false,
        error:
          "Google Kalender konnte nicht gelesen werden.",
        details:
          error?.message || String(error)
      },
      500
    );
  }
}
