import crypto from 'crypto';
import { env } from './env.js';

const tokenSecret = env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const TOKEN_TTL_SECONDS = 60 * 60;

const encode = (value) => Buffer.from(value).toString('base64url');

const sign = (message) => crypto
  .createHmac('sha256', tokenSecret)
  .update(message)
  .digest('base64url');

export const createToken = (user) => {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = encode(JSON.stringify({
    sub: user.id,
    email: user.email,
    name: user.name,
    iat: issuedAt,
    exp: issuedAt + TOKEN_TTL_SECONDS,
  }));
  const unsignedToken = `${header}.${payload}`;

  return `${unsignedToken}.${sign(unsignedToken)}`;
};

export const verifyToken = (token) => {
  const [header, payload, signature, extra] = token.split('.');
  if (!header || !payload || !signature || extra) {
    return null;
  }

  const unsignedToken = `${header}.${payload}`;
  const expected = Buffer.from(sign(unsignedToken));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    return null;
  }

  try {
    const decodedHeader = JSON.parse(Buffer.from(header, 'base64url').toString('utf8'));
    const decodedPayload = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (decodedHeader.alg !== 'HS256' || decodedPayload.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }

    return decodedPayload;
  } catch {
    return null;
  }
};

export const hashPassword = (password) => {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
};

export const comparePassword = (password, encodedHash) => {
  const [saltHex, hashHex, extra] = encodedHash.split(':');
  if (!saltHex || !hashHex || extra) {
    return false;
  }

  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, salt, expected.length);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
};
