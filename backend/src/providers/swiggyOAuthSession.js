import { createHash, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';
import { createSwiggyMcpClient } from './swiggyMcpClient.js';
import { createSwiggyDineoutMcpClient } from './swiggyDineoutMcpClient.js';

const PENDING_AUTH_TTL_MS = 10 * 60 * 1000;
const TOKEN_REAUTHORIZE_WINDOW_MS = 60 * 1000;
const SESSION_IDLE_TTL_MS = 5 * 24 * 60 * 60 * 1000;
const allowedOAuthHostnames = new Set(['mcp.swiggy.com', 'mcp-staging.swiggy.com']);

const randomUrlSafe = (size = 32) => randomBytes(size).toString('base64url');
const encodeChallenge = (verifier) => createHash('sha256').update(verifier).digest('base64url');
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const validateOAuthEndpoint = (value, baseUrl, expectedPath) => {
  const endpoint = new URL(value);
  if (
    endpoint.protocol !== 'https:'
    || endpoint.origin !== baseUrl.origin
    || endpoint.pathname !== expectedPath
  ) {
    throw new Error('Swiggy OAuth metadata contains an unexpected endpoint');
  }
  return endpoint.toString();
};

export const createSwiggyOAuthSession = ({
  oauthBaseUrl = env.SWIGGY_OAUTH_BASE_URL,
  redirectUri = env.SWIGGY_LOCAL_REDIRECT_URI,
  fetchImpl = fetch,
  now = () => Date.now(),
} = {}) => {
  const baseUrl = new URL(oauthBaseUrl);
  if (baseUrl.protocol !== 'https:' || !allowedOAuthHostnames.has(baseUrl.hostname)) {
    throw new Error('Swiggy OAuth base must be an official Swiggy HTTPS host');
  }
  const callbackUrl = new URL(redirectUri);
  if (
    !['localhost', '127.0.0.1', '[::1]'].includes(callbackUrl.hostname)
    || !['http:', 'https:'].includes(callbackUrl.protocol)
    || callbackUrl.pathname !== '/api/v1/swiggy/auth/callback'
    || callbackUrl.search
    || callbackUrl.hash
    || callbackUrl.username
    || callbackUrl.password
  ) {
    throw new Error('Swiggy local OAuth callback must use localhost');
  }

  const pendingAuthorizations = new Map();
  const knownAddresses = new Map();
  let registrationPromise;
  let accessToken;
  let expiresAt;
  let selectedAddressId;

  const getOAuthMetadata = async () => {
    const response = await fetchImpl(new URL('/.well-known/oauth-authorization-server', baseUrl), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      throw new Error(`Swiggy OAuth metadata request failed with HTTP ${response.status}`);
    }
    const metadata = await response.json();
    if (!isRecord(metadata)) {
      throw new Error('Swiggy returned invalid OAuth metadata');
    }

    return {
      authorizationEndpoint: validateOAuthEndpoint(
        metadata.authorization_endpoint,
        baseUrl,
        '/auth/authorize',
      ),
      registrationEndpoint: validateOAuthEndpoint(
        metadata.registration_endpoint,
        baseUrl,
        '/auth/register',
      ),
      tokenEndpoint: validateOAuthEndpoint(metadata.token_endpoint, baseUrl, '/auth/token'),
    };
  };

  const registerClient = async (metadata) => {
    const response = await fetchImpl(metadata.registrationEndpoint, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Tulya Local Development',
        redirect_uris: [callbackUrl.toString()],
        grant_types: ['authorization_code'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      throw new Error(`Swiggy OAuth client registration failed with HTTP ${response.status}`);
    }
    const registration = await response.json();
    if (typeof registration.client_id !== 'string' || !registration.client_id) {
      throw new Error('Swiggy OAuth registration did not return a client ID');
    }
    return registration.client_id;
  };

  const getRegisteredClient = async () => {
    if (!registrationPromise) {
      registrationPromise = (async () => {
        const metadata = await getOAuthMetadata();
        const clientId = await registerClient(metadata);
        return { ...metadata, clientId };
      })().catch((error) => {
        registrationPromise = undefined;
        throw error;
      });
    }
    return registrationPromise;
  };

  const startAuthorization = async () => {
    const registration = await getRegisteredClient();
    const state = randomUrlSafe();
    const verifier = randomUrlSafe(32);
    const createdAt = now();
    for (const [existingState, pending] of pendingAuthorizations.entries()) {
      if (pending.createdAt + PENDING_AUTH_TTL_MS <= createdAt) {
        pendingAuthorizations.delete(existingState);
      }
    }
    pendingAuthorizations.set(state, { verifier, createdAt });

    const authorizationUrl = new URL(registration.authorizationEndpoint);
    authorizationUrl.search = new URLSearchParams({
      response_type: 'code',
      client_id: registration.clientId,
      redirect_uri: callbackUrl.toString(),
      code_challenge: encodeChallenge(verifier),
      code_challenge_method: 'S256',
      state,
      scope: 'mcp:tools',
    }).toString();
    return authorizationUrl.toString();
  };

  const completeAuthorization = async ({ code, state }) => {
    if (typeof code !== 'string' || !code || typeof state !== 'string' || !state) {
      throw new Error('Swiggy authorization callback is missing its code or state');
    }
    const pending = pendingAuthorizations.get(state);
    pendingAuthorizations.delete(state);
    if (!pending || pending.createdAt + PENDING_AUTH_TTL_MS <= now()) {
      throw new Error('Swiggy authorization state is invalid or expired; start again');
    }

    const registration = await getRegisteredClient();
    const response = await fetchImpl(registration.tokenEndpoint, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        code_verifier: pending.verifier,
        redirect_uri: callbackUrl.toString(),
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      throw new Error(`Swiggy token exchange failed with HTTP ${response.status}`);
    }
    const tokenResponse = await response.json();
    if (
      typeof tokenResponse.access_token !== 'string'
      || !tokenResponse.access_token
      || typeof tokenResponse.expires_in !== 'number'
      || !Number.isFinite(tokenResponse.expires_in)
      || tokenResponse.expires_in <= 0
      || (tokenResponse.token_type && tokenResponse.token_type.toLowerCase() !== 'bearer')
    ) {
      throw new Error('Swiggy returned an invalid access token response');
    }

    accessToken = tokenResponse.access_token;
    expiresAt = now() + tokenResponse.expires_in * 1000;
    selectedAddressId = undefined;
    knownAddresses.clear();
    return { expiresAt: new Date(expiresAt).toISOString() };
  };

  const getValidAccessToken = () => {
    if (!accessToken || expiresAt - now() <= TOKEN_REAUTHORIZE_WINDOW_MS) {
      accessToken = undefined;
      expiresAt = undefined;
      selectedAddressId = undefined;
      knownAddresses.clear();
      return null;
    }
    return accessToken;
  };

  const createClient = () => {
    const token = getValidAccessToken();
    if (!token) return null;
    return createSwiggyMcpClient({
      environment: env.SWIGGY_MCP_ENVIRONMENT,
      accessToken: token,
      addressId: selectedAddressId,
      fetchImpl,
    });
  };

  const createDineoutClient = () => {
    const token = getValidAccessToken();
    if (!token) return null;
    return createSwiggyDineoutMcpClient({
      environment: env.SWIGGY_MCP_ENVIRONMENT,
      accessToken: token,
      fetchImpl,
    });
  };

  const rememberAddresses = (addresses) => {
    const safeAddresses = addresses.map((address) => {
      if (typeof address?.id !== 'string' || !address.id) {
        throw new Error('Swiggy returned an invalid address record');
      }
      knownAddresses.set(address.id, {
        id: address.id,
        ...(typeof address.addressLine === 'string' ? { addressLine: address.addressLine } : {}),
      });
      return { id: address.id };
    });
    return safeAddresses;
  };

  const selectAddress = (addressId) => {
    if (!knownAddresses.has(addressId)) {
      throw new Error('Select a saved location returned by the authenticated location list');
    }
    selectedAddressId = addressId;
  };

  const getSelectedAddressId = () => selectedAddressId;
  const getSelectedAddress = () => knownAddresses.get(selectedAddressId) || null;

  const disconnect = () => {
    accessToken = undefined;
    expiresAt = undefined;
    selectedAddressId = undefined;
    knownAddresses.clear();
    pendingAuthorizations.clear();
  };

  const logout = async () => {
    const token = getValidAccessToken();
    try {
      if (token) {
        const response = await fetchImpl(new URL('/auth/logout', baseUrl), {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
          },
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) {
          throw new Error(`Swiggy session logout failed with HTTP ${response.status}`);
        }
      }
    } finally {
      disconnect();
    }
  };

  const getStatus = () => {
    const validToken = getValidAccessToken();
    return {
      connected: Boolean(validToken),
      selectedAddress: Boolean(selectedAddressId),
      expiresAt: validToken ? new Date(expiresAt).toISOString() : null,
    };
  };

  return {
    startAuthorization,
    completeAuthorization,
    getValidAccessToken,
    createClient,
    createDineoutClient,
    rememberAddresses,
    selectAddress,
    getSelectedAddressId,
    getSelectedAddress,
    getStatus,
    disconnect,
    logout,
  };
};

export const createSwiggyOAuthSessionStore = ({
  createSession = () => createSwiggyOAuthSession(),
  now = () => Date.now(),
} = {}) => {
  const sessions = new Map();

  const get = (sessionId) => {
    const currentTime = now();
    for (const [existingId, entry] of sessions) {
      if (entry.lastAccessedAt + SESSION_IDLE_TTL_MS <= currentTime) {
        sessions.delete(existingId);
      }
    }

    const entry = sessions.get(sessionId);
    if (!entry) return null;

    entry.lastAccessedAt = currentTime;
    return entry.session;
  };

  const getOrCreate = (sessionId) => {
    const existingSession = get(sessionId);
    if (existingSession) return existingSession;

    const session = createSession();
    sessions.set(sessionId, { session, lastAccessedAt: now() });
    return session;
  };

  const remove = (sessionId) => {
    sessions.delete(sessionId);
  };

  return { get, getOrCreate, remove };
};

export const swiggyOAuthSessionStore = createSwiggyOAuthSessionStore();
