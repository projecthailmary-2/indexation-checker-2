// pages/api/auth.js
// POST { password } — verify passcode, set auth cookie
// POST { logout: true } — clear auth cookie

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // Logout
  if (req.body?.logout) {
    res.setHeader('Set-Cookie', 'auth=; HttpOnly; SameSite=Strict; Max-Age=0; Path=/');
    return res.status(200).json({ ok: true });
  }

  // Login
  const { password } = req.body || {};
  if (!password || password !== process.env.APP_PASSWORD) {
    return res.status(401).json({ error: 'Incorrect passcode' });
  }

  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const maxAge = 60 * 60 * 24 * 30; // 30 days
  res.setHeader('Set-Cookie', `auth=${process.env.APP_PASSWORD}; HttpOnly${secure}; SameSite=Strict; Max-Age=${maxAge}; Path=/`);
  return res.status(200).json({ ok: true });
}
