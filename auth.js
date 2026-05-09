import crypto from 'crypto';

const COOKIE_NAME = 'mvt_admin_session';
const SESSION_DAYS = 30;

function sign(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

export function createSessionCookie() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  const expires = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const value = `valid:${expires}`;
  const sig = sign(value, secret);
  return `${COOKIE_NAME}=${encodeURIComponent(value + ':' + sig)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 24 * 60 * 60}; Secure`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure`;
}

export function isAuthenticated(req) {
  const cookieHeader = req.headers.cookie || '';
  const cookies = Object.fromEntries(cookieHeader.split(';').map(c => {
    const [k, ...v] = c.trim().split('=');
    return [k, decodeURIComponent(v.join('='))];
  }));
  const raw = cookies[COOKIE_NAME];
  if (!raw) return false;

  const parts = raw.split(':');
  if (parts.length !== 3) return false;
  const [valid, expires, sig] = parts;

  const secret = process.env.ADMIN_SESSION_SECRET;
  const expected = sign(`${valid}:${expires}`, secret);
  if (sig !== expected) return false;
  if (parseInt(expires, 10) < Date.now()) return false;
  return valid === 'valid';
}
