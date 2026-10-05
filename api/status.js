// GET /api/status — whether Soneesh is in a calendar event right now (for the iMessage-style
// "notifications silenced" banner). Exposes only a boolean, never event details.
import { configured, accessToken, busy } from './_lib/gcal.js';

const json = (body, maxAge) =>
  Response.json(body, { headers: { 'Cache-Control': `public, s-maxage=${maxAge}, stale-while-revalidate=60` } });

export async function GET() {
  if (!configured()) return json({ focus: false }, 60);
  try {
    const now = Date.now();
    const b = await busy(await accessToken(), new Date(now), new Date(now + 60000));
    return json({ focus: b.some(([s, e]) => s <= now && e > now) }, 60);
  } catch (err) {
    console.error(err);
    return json({ focus: false }, 60);
  }
}
