// /api/donate: card / Apple Pay / Google Pay support through Stripe Checkout (payouts go to his bank).
//   GET                 -> { enabled } so the page only shows the card option once a key is set
//   GET ?session=cs_... -> { paid, amount } for the thank-you message
//   POST { amount }     -> { url } of a Stripe-hosted Checkout page for that many dollars
// Needs STRIPE_SECRET_KEY in Vercel env. Card details never touch this site.
const KEY = process.env.STRIPE_SECRET_KEY;
const MIN = 1, MAX = 5000; // dollars
const ORIGINS = ['https://soneeshk.com', 'https://www.soneeshk.com'];

const json = (status, body) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

async function stripe(path, params) {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: params ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${KEY}`, ...(params && { 'Content-Type': 'application/x-www-form-urlencoded' }) },
    body: params ? new URLSearchParams(params) : undefined,
  });
  const body = await r.json();
  if (!r.ok) throw new Error(`stripe ${r.status}: ${body?.error?.message || 'error'}`);
  return body;
}

// Send people back to the site they came from (prod, or localhost while testing).
function origin(request) {
  const o = new URL(request.url).origin;
  return ORIGINS.includes(o) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o) ? o : ORIGINS[0];
}

export async function GET(request) {
  if (!KEY) return json(200, { enabled: false });
  const id = new URL(request.url).searchParams.get('session');
  if (!id) return json(200, { enabled: true });
  if (!/^cs_(test|live)_[A-Za-z0-9]{10,200}$/.test(id)) return json(400, { error: 'bad session' });
  try {
    const s = await stripe(`checkout/sessions/${id}`);
    return json(200, { paid: s.payment_status === 'paid', amount: s.amount_total / 100 });
  } catch (err) {
    console.error(err);
    return json(502, { error: 'unavailable' });
  }
}

export async function POST(request) {
  if (!KEY) return json(503, { error: 'Card payments aren’t set up yet.' });
  let data;
  try { data = await request.json(); } catch { return json(400, { error: 'Invalid request.' }); }
  const amount = Math.round(Number(data?.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount < MIN || amount > MAX) {
    return json(400, { error: `Pick an amount from $${MIN} to $${MAX.toLocaleString('en-US')}.` });
  }
  const site = origin(request);
  try {
    const s = await stripe('checkout/sessions', {
      mode: 'payment',
      submit_type: 'donate',
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][unit_amount]': String(Math.round(amount * 100)),
      'line_items[0][price_data][product_data][name]': 'Support for Soneesh',
      'line_items[0][price_data][product_data][description]': 'A personal gift. Not tax-deductible.',
      'custom_fields[0][key]': 'note',
      'custom_fields[0][label][type]': 'custom',
      'custom_fields[0][label][custom]': 'Leave a note (optional)',
      'custom_fields[0][type]': 'text',
      'custom_fields[0][optional]': 'true',
      success_url: `${site}/donate?thanks={CHECKOUT_SESSION_ID}`,
      cancel_url: `${site}/donate`,
    });
    return json(200, { url: s.url });
  } catch (err) {
    console.error(err);
    return json(502, { error: 'Couldn’t start checkout. Try again in a minute.' });
  }
}
