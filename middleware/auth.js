import jwt from 'jsonwebtoken';

export const COOKIE_NAME = 'token';
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

// HTTPOnly means JavaScript in the browser can never read this cookie.
export function cookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: SEVEN_DAYS,
    path: '/',
  };
}

export function signToken(user) {
  return jwt.sign(
    { id: String(user._id), name: user.name, email: user.email, photoUrl: user.photoUrl || '' },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// Put this before any route that needs a logged-in user.
export function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Please log in to continue' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Your session has expired. Please log in again' });
  }
}
