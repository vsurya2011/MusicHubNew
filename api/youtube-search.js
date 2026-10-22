export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const q = String(req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Missing search query' });
  if (!process.env.YOUTUBE_API_KEY) return res.status(500).json({ error: 'Set YOUTUBE_API_KEY in Vercel environment variables' });
  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=12&q=${encodeURIComponent(q)}&key=${process.env.YOUTUBE_API_KEY}`;
    const response = await fetch(url);
    if (!response.ok) return res.status(502).json({ error: 'YouTube search failed' });
    const data = await response.json();
    return res.status(200).json((data.items || []).filter(x => x.id?.videoId).map(x => ({ videoId: x.id.videoId, title: x.snippet.title, channelTitle: x.snippet.channelTitle, thumbnail: x.snippet.thumbnails?.medium?.url || x.snippet.thumbnails?.default?.url || '' })));
  } catch { return res.status(500).json({ error: 'YouTube search failed' }); }
}
