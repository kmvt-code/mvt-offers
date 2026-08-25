import crypto from 'crypto';
import { cookies } from 'next/headers';

const COOKIE_NAME = 'mvt_admin_session';
const SESSION_DAYS = 30;
const MAX_AGE_SECONDS = SESSION_DAYS * 24 * 60 * 60;

// Per-process key used only to make comparisons constant-time. It never leaves
// this process and is not a secret anyone needs to configure.
const COMPARE_KEY = crypto.randomBytes(32);

// Compare two values in constant time regardless of their length.
// crypto.timingSafeEqual throws on differing lengths, and the length of a
// rejected password or signature is itself a small leak, so both sides are
// hashed to a fixed width first.
function constantTimeEquals(a, b) {
  const digest = value =>
    crypto.createHmac('sha256', COMPARE_KEY).update(String(value)).digest();
  return crypto.timingSafeEqual(digest(a), digest(b));
}

function sign(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

function sessionSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (typeof secret === 'string' && secret.length > 0) return secret;
  console.error('[auth] ADMIN_SESSION_SECRET is not set. Admin sessions cannot be verified.');
  return null;
}

// True only when the submitted password matches a configured one. If
// ADMIN_PASSWORD is missing or empty we refuse every login rather than
// comparing undefined to undefined, which would let an empty request through.
export function passwordMatches(submitted) {
  const expected = process.env.ADMIN_PASSWORD;
  if (typeof expected !== 'string' || expected.length === 0) {
    console.error('[auth] ADMIN_PASSWORD is not set. Refusing every login attempt.');
    return false;
  }
  if (typeof submitted !== 'string' || submitted.length === 0) return false;
  return constantTimeEquals(submitted, expected);
}

export function createSessionCookie() {
  const secret = sessionSecret();
  if (!secret) {
    throw new Error('ADMIN_SESSION_SECRET is not set, refusing to issue an admin session');
  }
  const expires = Date.now() + MAX_AGE_SECONDS * 1000;
  const value = `valid:${expires}`;
  const sig = sign(value, secret);
  return `${COOKIE_NAME}=${encodeURIComponent(value + ':' + sig)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_SECONDS}; Secure`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure`;
}

// The single admin session check. Every admin page and API route uses this.
// Reads the cookie through next/headers, so it works in both server
// components and route handlers.
export function isAuthed() {
  const secret = sessionSecret();
  if (!secret) return false;

  const cookie = cookies().get(COOKIE_NAME);
  if (!cookie) return false;

  const parts = cookie.value.split(':');
  if (parts.length !== 3) return false;
  const [valid, expires, sig] = parts;

  if (!constantTimeEquals(sig, sign(`${valid}:${expires}`, secret))) return false;

  const expiresAt = parseInt(expires, 10);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;

  return valid === 'valid';
}
