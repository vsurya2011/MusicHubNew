import admin from 'firebase-admin';
function getAdmin() {
  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_JSON in Vercel environment variables');
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
  }
  return admin;
}
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { password, uid } = req.body || {};
  if (!process.env.OWNER_PASSWORD) return res.status(500).json({ error: 'Set OWNER_PASSWORD in Vercel project settings' });
  if (!password || password !== process.env.OWNER_PASSWORD) return res.status(401).json({ error: 'Incorrect owner password' });
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid || '')) return res.status(400).json({ error: 'Invalid user session' });
  try {
    const a = getAdmin();
    const customToken = await a.auth().createCustomToken(uid, { owner: true });
    return res.status(200).json({ customToken });
  } catch (e) {
    console.error('Owner auth error:', e.message);
    return res.status(500).json({ error: 'Owner authentication is not configured correctly' });
  }
}
