// GET /api/steps — Soneesh's step count so far today (local midnight to now), from the Google Health
// API (Fitbit) daily rollup. Cached at the edge for 15 minutes.
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
    return json(200, { steps, date: today }, 900);
  } catch (err) {
    console.error(err);
    return json(502, { error: 'unavailable' }, 120);
  }
}
