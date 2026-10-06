// GET /api/steps — Soneesh's step count so far today (local midnight to now), from the Google Health
// API (Fitbit) daily rollup. Cached for a minute so the page's live counter follows each Fitbit sync.
import { configured, json, localDate, accessToken, HEALTH } from './_lib/health.js';

const civil = (ymd) => {
  const [year, month, day] = ymd.split('-').map(Number);
  return { date: { year, month, day }, time: { hours: 0, minutes: 0 } };
};

export async function GET() {
  if (!configured()) return json(503, { error: 'not configured' }, 60);
  try {
    const token = await accessToken();
    const today = localDate();
    const [y, m, d] = today.split('-').map(Number);
    const tomorrow = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
    const r = await fetch(`${HEALTH}/steps/dataPoints:dailyRollUp`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ range: { start: civil(today), end: civil(tomorrow) } }),
    });
    if (!r.ok) throw new Error(`health ${r.status}: ${await r.text()}`);
    const { rollupDataPoints = [] } = await r.json();
    const steps = rollupDataPoints.reduce((n, p) => n + Number(p.steps?.countSum || 0), 0);
    // When the newest raw step sample ends (the list is newest-first): i.e. the last Fitbit -> Google sync.
    let asOf = null;
    try {
      const q = await fetch(`${HEALTH}/steps/dataPoints?pageSize=1`, { headers: { Authorization: `Bearer ${token}` } });
      if (q.ok) asOf = (await q.json()).dataPoints?.[0]?.steps?.interval?.endTime || null;
    } catch { /* optional */ }
    return json(200, { steps, date: today, asOf }, 60, 60);
  } catch (err) {
    console.error(err);
    return json(502, { error: 'unavailable' }, 30, 0);
  }
}
