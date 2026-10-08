// GET /api/podcast — the newest episode of The Surgeon Soneesh Show, read from its Buzzsprout RSS feed.
// Cached at the edge for an hour, so a new episode shows up on the site within about an hour of publishing.
const FEED = 'https://feeds.buzzsprout.com/2511358.rss';
const SHOW = 'https://thesurgeonsoneeshshow.buzzsprout.com/2511358';

const json = (status, body, maxAge) =>
  Response.json(body, { status, headers: { 'Cache-Control': `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge}` } });

const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? m[1].replace(/^<!\[CDATA\[|\]\]>$/g, '').trim() : null;
};
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");

export async function GET() {
  try {
    const r = await fetch(FEED, { headers: { 'User-Agent': 'soneeshk.com' } });
    if (!r.ok) throw new Error(`feed ${r.status}`);
    const xml = await r.text();
    const item = xml.split('<item>')[1];
    if (!item) return json(200, { episode: null }, 3600);
    const id = (tag(item, 'guid') || '').match(/(\d+)$/)?.[1];
    return json(200, {
      episode: {
        title: decode(tag(item, 'title') || ''),
        date: new Date(tag(item, 'pubDate')).toISOString(),
        seconds: Number(tag(item, 'itunes:duration')) || null,
        url: id ? `${SHOW}/episodes/${id}` : SHOW,
      },
    }, 3600);
  } catch (err) {
    console.error(err);
    return json(502, { error: 'unavailable' }, 60);
  }
}
