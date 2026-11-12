import { randomBytes } from 'node:crypto';
import { swiggyOAuthSessionStore } from '../providers/swiggyOAuthSession.js';

export const SWIGGY_SESSION_COOKIE = 'tulya_swiggy_session';
const SESSION_COOKIE_MAX_AGE_SECONDS = 5 * 24 * 60 * 60;
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const readSessionCookie = (cookieHeader) => {
  if (typeof cookieHeader !== 'string') return null;

  for (const cookie of cookieHeader.split(';')) {
    const separator = cookie.indexOf('=');
    if (separator < 0 || cookie.slice(0, separator).trim() !== SWIGGY_SESSION_COOKIE) continue;

    let value = cookie.slice(separator + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    try {
      value = decodeURIComponent(value);
    } catch (error) {
      if (!(error instanceof URIError)) throw error;
      return null;
    }
    return SESSION_ID_PATTERN.test(value) ? value : null;
  }
  return null;
};

const createSessionId = () => randomBytes(32).toString('base64url');

const setSessionCookie = (res, sessionId, secure = false) => {
  res.append(
    'Set-Cookie',
    `${SWIGGY_SESSION_COOKIE}=${sessionId}; HttpOnly; SameSite=Lax; Path=/api/v1; Max-Age=${SESSION_COOKIE_MAX_AGE_SECONDS}${secure ? '; Secure' : ''}`,
  );
};

export const swiggyOAuthSessionMiddleware = (req, res, next) => {
  const suppliedSessionId = readSessionCookie(req.headers.cookie);
  let sessionId = suppliedSessionId;
  let session = sessionId ? swiggyOAuthSessionStore.get(sessionId) : null;

  if (!session) {
    sessionId = createSessionId();
    session = swiggyOAuthSessionStore.getOrCreate(sessionId);
    setSessionCookie(res, sessionId, req.secure);
  }

  req.swiggyOAuthSessionId = sessionId;
  req.swiggyOAuthSession = session;
  return next();
};

export const clearSwiggyOAuthSessionCookie = (res, secure = false) => {
  res.append(
    'Set-Cookie',
    `${SWIGGY_SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/api/v1; Max-Age=0${secure ? '; Secure' : ''}`,
  );
};
