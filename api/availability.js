import {
  CAPACITY,
  schedule,
  localDay,
  seatsUsed
} from "./common.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Methode nicht erlaubt"
    });
  }

  try {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({
        error: "Datum fehlt"
      });
    }

    const day = localDay(date);
    const times = schedule[day] || [];

    if (times.length === 0) {
      return res.status(200).json({
        date,
        slots: []
      });
    }

    const slots = [];

    for (const time of times) {
      const used = await seatsUsed(date, time);
      const remaining = Math.max(0, CAPACITY - used);

      slots.push({
        time,
        capacity: CAPACITY,
        used,
        remaining,
        available: remaining > 0
      });
    }

    return res.status(200).json({
      date,
      slots
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Verfügbarkeit konnte nicht geladen werden."
    });
  }
}
