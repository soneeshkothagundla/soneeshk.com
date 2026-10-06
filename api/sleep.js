// GET /api/sleep — minutes Soneesh slept "today" (sessions ending since local midnight), or on the
// most recent day with sleep if today has none,
// read from the Google Health API (Fitbit). Cached at the edge so Google is hit at most ~2x/hour.
import { configured, json, localDate, accessToken, HEALTH } from './_lib/health.js';
const API = `${HEALTH}/sleep/dataPoints`;

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
  if (!configured()) return json(503, { error: 'not configured' }, 60);
  try {
    const token = await accessToken();
    // Look back two weeks; if nothing ended today (tracker not worn / not synced), fall back to the
    // most recent day that has sleep, grouped by the local date the session ended.
    const lookback = new Date(Date.now() - 14 * 864e5).toISOString();
    const url = `${API}?pageSize=100&filter=${encodeURIComponent(`sleep.interval.end_time >= "${lookback}"`)}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`health ${r.status}: ${await r.text()}`);
    const { dataPoints = [] } = await r.json();
    const byDate = {};
    for (const dp of dataPoints) {
      const end = dp.sleep?.interval?.endTime;
      const m = minutesAsleep(dp) || 0;
      if (!end || !m) continue;
      const d = localDate(new Date(end));
      byDate[d] = (byDate[d] || 0) + m;
    }
    const todayDate = localDate();
    const date = byDate[todayDate] ? todayDate : Object.keys(byDate).sort().at(-1) || null;
    return json(200, { minutes: date ? byDate[date] : 0, date, today: date === todayDate });
  } catch (err) {
    console.error(err);
    return json(502, { error: 'unavailable' }, 30, 0);
  }
}
