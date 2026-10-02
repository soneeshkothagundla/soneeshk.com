// GET /api/sleep — minutes Soneesh slept "today" (sessions ending since local midnight),
// read from the Google Health API (Fitbit). Cached at the edge so Google is hit at most ~2x/hour.
const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;
const TZ = process.env.SLEEP_TZ || 'America/New_York';
const API = 'https://health.googleapis.com/v4/users/me/dataTypes/sleep/dataPoints';

const json = (status, body, maxAge = 1800) =>
  Response.json(body, {
    status,
    headers: { 'Cache-Control': `public, s-maxage=${maxAge}, stale-while-revalidate=3600` },
  });

// UTC instant of 00:00 today in TZ.
function localMidnightUtc(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
      .formatToParts(now).map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const offset = asUtc - now.getTime(); // TZ offset in ms at this instant
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day) - offset);
}

async function accessToken() {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  if (!r.ok) throw new Error(`token ${r.status}: ${await r.text()}`);
  return (await r.json()).access_token;
}

// minutesAsleep lives in the sleep summary; search for it so small schema shifts don't break us.
function minutesAsleep(node) {
  if (!node || typeof node !== 'object') return null;
  if (typeof node.minutesAsleep === 'number' || typeof node.minutesAsleep === 'string') return Number(node.minutesAsleep);
  for (const v of Object.values(node)) {
    const m = minutesAsleep(v);
    if (m != null) return m;
  }
  return null;
}

export async function GET() {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) return json(503, { error: 'not configured' }, 60);
  try {
    const token = await accessToken();
    const since = localMidnightUtc().toISOString();
    const url = `${API}?pageSize=25&filter=${encodeURIComponent(`sleep.interval.end_time >= "${since}"`)}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`health ${r.status}: ${await r.text()}`);
    const { dataPoints = [] } = await r.json();
    const minutes = dataPoints.reduce((sum, dp) => sum + (minutesAsleep(dp) || 0), 0);
    return json(200, { minutes, sessions: dataPoints.length, since });
  } catch (err) {
    console.error(err);
    return json(502, { error: 'unavailable' }, 120);
  }
}
