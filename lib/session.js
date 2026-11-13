'use strict';

const crypto = require('crypto');

const COOKIE_NAME = 'fablab_session';
const SESSION_TTL = 8 * 60 * 60 * 1000; // 8 horas
let warned = false;

function secret() {
  const value = process.env.SESSION_SECRET;
  if (value) return value;
  if (isProduction() && !warned) {
    warned = true;
    console.warn(
      'AVISO: defina SESSION_SECRET nas variáveis de ambiente. Usando um segredo inseguro de desenvolvimento.'
    );
  }
  return 'dev-only-insecure-secret-change-me';
}

function passwordVersion(user) {
  return crypto
    .createHmac('sha256', secret())
    .update(String(user.passwordHash || ''))
    .digest('base64url')
    .slice(0, 16);
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function verify(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, signature] = parts;

  const expected = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  const givenBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    givenBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(givenBuffer, expectedBuffer)
  ) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (!payload || typeof payload.uid !== 'string' || typeof payload.exp !== 'number') return null;
  if (payload.exp < Date.now()) return null;
  return payload;
}

function isProduction() {
  return process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
}

function cookieAttributes(maxAgeSeconds) {
  const parts = [
    `${COOKIE_NAME}=`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`
  ];
  if (isProduction()) parts.push('Secure');
  return parts;
}

function createSessionCookie(user) {
  const token = sign({
    uid: user.id,
    role: user.role,
    pv: passwordVersion(user),
    exp: Date.now() + SESSION_TTL
  });
  const parts = cookieAttributes(SESSION_TTL / 1000);
  parts[0] = `${COOKIE_NAME}=${encodeURIComponent(token)}`;
  return parts.join('; ');
}

function clearSessionCookie() {
  const parts = cookieAttributes(0);
  parts[0] = `${COOKIE_NAME}=`;
  return parts.join('; ');
}

function readSessionToken(req) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    if (key !== COOKIE_NAME) continue;
    const value = part.slice(index + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return null;
}

module.exports = {
  SESSION_TTL,
  passwordVersion,
  createSessionCookie,
  clearSessionCookie,
  readSessionToken,
  verifySessionToken: verify
};
