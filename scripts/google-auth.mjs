// One-time: authorize a Google account and store its refresh token in Vercel (never printed).
// Usage:
//   node scripts/google-auth.mjs sleep      Fitbit sleep + steps (surgeonsoneesh@gmail.com) -> GOOGLE_REFRESH_TOKEN
//   node scripts/google-auth.mjs calendar   Calendar     (soneesh@closrhealth.me)       -> GCAL_REFRESH_TOKEN
// Needs GOOGLE_CLIENT_ID/SECRET in .env.google (git-ignored).
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { spawn, exec } from 'node:child_process';

const PROFILES = {
  sleep: {
    // Sleep + steps from the same Fitbit account.
    scope: 'https://www.googleapis.com/auth/googlehealth.sleep.readonly https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
    hint: 'surgeonsoneesh@gmail.com',
    tokenVar: 'GOOGLE_REFRESH_TOKEN',
  },
  calendar: {
    // Busy times across calendars + create the booking event. Nothing else.
    scope: [
      'https://www.googleapis.com/auth/calendar.freebusy',
      'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
      'https://www.googleapis.com/auth/calendar.events.owned',
    ].join(' '),
    hint: 'soneesh@closrhealth.me',
    tokenVar: 'GCAL_REFRESH_TOKEN',
  },
};
const profile = PROFILES[process.argv[2] || 'sleep'];
if (!profile) { console.error('Unknown profile. Use: sleep | calendar'); process.exit(1); }

const env = Object.fromEntries(
  readFileSync(new URL('../.env.google', import.meta.url), 'utf8')
    .split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const { GOOGLE_CLIENT_ID: id, GOOGLE_CLIENT_SECRET: secret } = env;
const PORT = 5555, REDIRECT = `http://localhost:${PORT}/callback`;
const SCOPE_ARGS = ['--scope', 'soneesh-kothagundlas-projects'];

const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
  client_id: id, redirect_uri: REDIRECT, response_type: 'code', scope: profile.scope,
  access_type: 'offline', prompt: 'consent', login_hint: profile.hint,
});

function vercelEnvAdd(name, value) {
  return new Promise((resolve, reject) => {
    const p = spawn('vercel', ['env', 'add', name, 'production', '--force', ...SCOPE_ARGS], { shell: true, stdio: ['pipe', 'ignore', 'inherit'] });
    p.stdin.end(value);
    p.on('exit', (c) => (c === 0 ? resolve() : reject(new Error(`vercel env add ${name} exited ${c}`))));
  });
}

http.createServer(async (req, res) => {
  const u = new URL(req.url, REDIRECT);
  if (u.pathname !== '/callback') return res.end();
  const code = u.searchParams.get('code');
  if (!code) { res.end('No code: ' + u.searchParams.get('error')); process.exit(1); }
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: REDIRECT, grant_type: 'authorization_code' }),
  });
  const t = await r.json();
  if (!t.refresh_token) { res.end('No refresh token returned.'); console.error('token response keys:', Object.keys(t)); process.exit(1); }
  console.log('Granted scopes:', t.scope);
  await vercelEnvAdd('GOOGLE_CLIENT_ID', id);
  await vercelEnvAdd('GOOGLE_CLIENT_SECRET', secret);
  await vercelEnvAdd(profile.tokenVar, t.refresh_token);
  res.end('Done. You can close this tab.');
  console.log(`Saved ${profile.tokenVar} to Vercel (production).`);
  process.exit(0);
}).listen(PORT, () => {
  console.log(authUrl);
  if (!process.env.NO_OPEN) exec(`start "" "${authUrl}"`);
});
