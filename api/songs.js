const paths = { tamil: 'public/songs/tamil', english: 'public/songs/english' };
export default async function handler(req, res) {
  const category = String(req.query.category || '').toLowerCase();
  if (!paths[category]) return res.status(400).json({ error: 'Unknown song category' });
  try {
    const url = `https://api.github.com/repos/vsurya2011/Music-Room/contents/${paths[category]}`;
    const response = await fetch(url, { headers: { 'User-Agent': 'music-room-app', 'Accept': 'application/vnd.github+json' } });
    if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
    const files = await response.json();
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');
    return res.status(200).json((Array.isArray(files) ? files : []).filter(f => f.type === 'file' && /\.(mp3|wav|ogg|m4a)$/i.test(f.name)).map(f => ({ name: f.name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' '), url: f.download_url })));
  } catch (e) { console.error(e); return res.status(502).json({ error: 'Could not load song library from GitHub' }); }
}
