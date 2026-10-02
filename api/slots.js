// GET /api/slots — open 10-minute slots for the next 4 weeks (Thu 7–8 PM, Fri 4–10 PM ET),
// minus anything already on Soneesh's Google Calendar. Returns only slot start times.
import { configured, accessToken, candidateSlots, busy, overlaps, SLOT_MIN } from './_lib/gcal.js';

export async function GET() {
  if (!configured()) return Response.json({ error: 'not configured' }, { status: 503 });
  try {
    const slots = candidateSlots();
    if (!slots.length) return Response.json({ slots: [] });
    const token = await accessToken();
    const end = new Date(slots[slots.length - 1].getTime() + SLOT_MIN * 60000);
    const b = await busy(token, slots[0], end);
    const open = slots.filter((s) => !overlaps(s, b)).map((s) => s.toISOString());
    return Response.json({ slots: open, minutes: SLOT_MIN }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'unavailable' }, { status: 502 });
  }
}
