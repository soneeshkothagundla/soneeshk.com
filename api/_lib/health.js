// Shared Google Health API (Fitbit) helpers for /api/sleep and /api/steps.
const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;
export const TZ = process.env.SLEEP_TZ || 'America/New_York';
export const HEALTH = 'https://health.googleapis.com/v4/users/me/dataTypes';

export const configured = () => Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_REFRESH_TOKEN);

export const json = (status, body, maxAge = 1800, swr = 3600) =>
  Response.json(body, {
    status,
    headers: { 'Cache-Control': `public, s-maxage=${maxAge}, stale-while-revalidate=${swr}` },
  });

// YYYY-MM-DD of an instant in TZ.
export const localDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);

export async function accessToken() {
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
