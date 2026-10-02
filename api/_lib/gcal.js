// Shared Google Calendar helpers for /api/slots and /api/book.
// Soneesh's calendar is only ever read here, on the server; visitors only see open slot times.
const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GCAL_REFRESH_TOKEN } = process.env;
const CAL = 'https://www.googleapis.com/calendar/v3';

export const TZ = 'America/New_York';
export const SLOT_MIN = 10;
export const WINDOW_DAYS = 28;
export const LEAD_MIN = 60; // no bookings less than an hour out
// Weekly availability in Soneesh's time zone: weekday (0=Sun) -> [startHour, endHour)
export const HOURS = { 4: [19, 20], 5: [16, 22] };

export const configured = () => Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GCAL_REFRESH_TOKEN);

export async function accessToken() {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: GCAL_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  if (!r.ok) throw new Error(`token ${r.status}: ${await r.text()}`);
  return (await r.json()).access_token;
}

export async function gcal(token, path, init = {}) {
  const r = await fetch(CAL + path, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  if (!r.ok) {
    const err = new Error(`gcal ${r.status}: ${await r.text()}`);
    err.status = r.status;
    throw err;
  }
  return r.status === 204 ? null : r.json();
}

// Wall-clock parts of an instant in TZ.
function parts(date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
    }).formatToParts(date).map((x) => [x.type, x.value]),
  );
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, wd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday) };
}

// UTC instant for a wall-clock time in TZ (DST-safe: correct the guess twice).
export function zoned(y, m, d, h, min) {
  let t = Date.UTC(y, m - 1, d, h, min);
  for (let i = 0; i < 2; i++) {
    const p = parts(new Date(t));
    t += Date.UTC(y, m - 1, d, h, min) - Date.UTC(p.y, p.m - 1, p.d, p.h, p.min);
  }
  return new Date(t);
}

// Every bookable slot start in the window, before removing busy times.
export function candidateSlots(now = new Date()) {
  const out = [];
  const earliest = now.getTime() + LEAD_MIN * 60000;
  for (let i = 0; i <= WINDOW_DAYS; i++) {
    const day = parts(new Date(now.getTime() + i * 86400000));
    const hours = HOURS[day.wd];
    if (!hours) continue;
    for (let h = hours[0]; h < hours[1]; h++) {
      for (let min = 0; min < 60; min += SLOT_MIN) {
        const s = zoned(day.y, day.m, day.d, h, min);
        if (s.getTime() >= earliest) out.push(s);
      }
    }
  }
  return out;
}

// Busy intervals across every calendar Soneesh has selected in Google Calendar.
export async function busy(token, timeMin, timeMax) {
  const list = await gcal(token, '/users/me/calendarList?minAccessRole=freeBusyReader&maxResults=250');
  const ids = (list.items || []).filter((c) => c.primary || c.selected).map((c) => ({ id: c.id }));
  if (!ids.length) ids.push({ id: 'primary' });
  const fb = await gcal(token, '/freeBusy', {
    method: 'POST',
    body: JSON.stringify({ timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString(), timeZone: TZ, items: ids }),
  });
  const out = [];
  for (const c of Object.values(fb.calendars || {})) for (const b of c.busy || []) out.push([Date.parse(b.start), Date.parse(b.end)]);
  return out;
}

export const overlaps = (start, busyList) => {
  const s = start.getTime(), e = s + SLOT_MIN * 60000;
  return busyList.some(([bs, be]) => bs < e && be > s);
};
