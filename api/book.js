// POST /api/book — book one open 10-minute slot. Re-checks Soneesh's calendar at booking time
// (his calendar always wins), creates the event with a private soneeshk.com/meet room, and has
// Google email the booker an invite.
import { randomBytes } from 'node:crypto';
import { configured, accessToken, candidateSlots, busy, overlaps, gcal, SLOT_MIN, TZ } from './_lib/gcal.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const json = (status, body) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const clean = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '');

// Calendar event ids must be base32hex (0-9a-v). Deterministic per slot so two simultaneous
// bookings of the same slot can't both succeed.
const eventId = (start) => 'sk' + Math.floor(start.getTime() / 60000).toString(32);

export async function POST(request) {
  if (!configured()) return json(503, { error: 'Booking is not set up yet.' });
  let data;
  try { data = await request.json(); } catch { return json(400, { error: 'Invalid request.' }); }
  if (data?.website) return json(200, { ok: true }); // honeypot

  const name = clean(data?.name, 80);
  const email = clean(data?.email, 254).toLowerCase();
  const note = clean(data?.note, 500);
  const start = new Date(typeof data?.start === 'string' ? data.start : NaN);
  if (!name) return json(400, { error: 'Add your name.' });
  if (!EMAIL_RE.test(email)) return json(400, { error: 'Add a valid email.' });
  if (!candidateSlots().some((s) => s.getTime() === start.getTime())) return json(400, { error: 'That time isn’t bookable.' });

  try {
    const token = await accessToken();
    const end = new Date(start.getTime() + SLOT_MIN * 60000);

    // His calendar supersedes: if anything is there now, the slot is gone.
    if (overlaps(start, await busy(token, start, end))) return json(409, { error: 'That time was just taken. Pick another.' });

    // One upcoming booking per email.
    const mine = await gcal(token, `/calendars/primary/events?privateExtendedProperty=${encodeURIComponent('booker=' + email)}&timeMin=${new Date().toISOString()}&singleEvents=true&maxResults=1`);
    if (mine.items?.length) return json(409, { error: 'You already have a time booked. Check your email for the invite.' });

    const room = randomBytes(12).toString('base64url');
    const url = `https://soneeshk.com/meet/${room}`;
    const event = {
      summary: `Soneesh × ${name}`,
      location: url,
      description: [`Join: ${url}`, note && `\nNote from ${name}:\n${note}`, '\nBooked via soneeshk.com'].filter(Boolean).join('\n'),
      start: { dateTime: start.toISOString(), timeZone: TZ },
      end: { dateTime: end.toISOString(), timeZone: TZ },
      attendees: [{ email, displayName: name }],
      extendedProperties: { private: { booker: email, room } },
      reminders: { useDefault: true },
    };
    const insert = (body) => gcal(token, '/calendars/primary/events?sendUpdates=all', { method: 'POST', body: JSON.stringify(body) });
    try {
      await insert({ ...event, id: eventId(start) });
    } catch (err) {
      if (err.status !== 409) throw err;
      // Id already used. If the slot is still free (an old booking was deleted), book with a fresh id.
      if (overlaps(start, await busy(token, start, end))) return json(409, { error: 'That time was just taken. Pick another.' });
      await insert(event);
    }
    return json(200, { ok: true, start: start.toISOString(), url });
  } catch (err) {
    console.error(err);
    return json(502, { error: 'Couldn’t book right now. Try again in a minute.' });
  }
}
