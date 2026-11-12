const MCP_PROTOCOL_VERSION = '2025-03-26';
const MCP_ACCEPT = 'application/json, text/event-stream';
export const SWIGGY_ENDPOINTS = {
  staging: 'https://mcp-staging.swiggy.com/food',
  production: 'https://mcp.swiggy.com/food',
};
export const SWIGGY_DINEOUT_ENDPOINTS = {
  staging: 'https://mcp-staging.swiggy.com/dineout',
  production: 'https://mcp.swiggy.com/dineout',
};

export const getSwiggyFoodEndpoint = (environment = 'production') => {
  const endpoint = SWIGGY_ENDPOINTS[environment];
  if (!endpoint) {
    throw new Error('Unsupported Swiggy MCP environment');
  }
  return endpoint;
};

export const getSwiggyDineoutEndpoint = (environment = 'production') => {
  const endpoint = SWIGGY_DINEOUT_ENDPOINTS[environment];
  if (!endpoint) {
    throw new Error('Unsupported Swiggy Dineout MCP environment');
  }
  return endpoint;
};

const readMcpResponse = async (response) => {
  if (!response.ok) {
    const error = new Error(`Swiggy MCP returned HTTP ${response.status}`);
    error.statusCode = response.status;
    throw error;
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const payload = await response.json();
    if (payload.error) {
      const error = new Error('Swiggy MCP request failed');
      if (payload.error.code === -32001) error.statusCode = 401;
      throw error;
    }
    return { payload, sessionId: response.headers.get('mcp-session-id') };
  }

  const eventStream = await response.text();
  const messages = eventStream
    .split(/\r?\n\r?\n/)
    .map((event) => event.split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('\n'))
    .filter(Boolean);
  if (messages.length === 0) throw new Error('Swiggy MCP returned an empty response');

  const payloads = messages.map((message) => JSON.parse(message));
  const payload = payloads.reverse().find((message) => message.result || message.error);
  if (!payload) throw new Error('Swiggy MCP returned no JSON-RPC response');
  if (payload.error) {
    const error = new Error('Swiggy MCP request failed');
    if (payload.error.code === -32001) error.statusCode = 401;
    throw error;
  }
  return { payload, sessionId: response.headers.get('mcp-session-id') };
};

const createMcpRequest = ({ endpoint, accessToken, fetchImpl }, id, method, params, sessionId) =>
  fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      Accept: MCP_ACCEPT,
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}),
      ...(sessionId ? { 'MCP-Protocol-Version': MCP_PROTOCOL_VERSION } : {}),
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      ...(id === null ? {} : { id }),
      method,
      ...(params ? { params } : {}),
    }),
    signal: AbortSignal.timeout(12000),
  });

const aliases = {
  address: ['address', 'formattedaddress', 'restaurantaddress'],
  addressId: ['addressid'],
  date: ['date'],
  guestCount: ['guestcount'],
  latitude: ['latitude', 'lat'],
  limit: ['limit'],
  longitude: ['longitude', 'lng', 'lon'],
  offset: ['offset'],
  page: ['page'],
  pageSize: ['pagesize'],
  query: ['query', 'searchquery'],
  restaurantId: ['restaurantid'],
};

export const buildFoodToolArguments = (inputSchema, supplied) => {
  const properties = inputSchema?.properties || {};
  const args = {};

  Object.entries(properties).forEach(([property]) => {
    const normalized = property.toLowerCase().replace(/[^a-z]/g, '');
    const matchingAlias = Object.entries(aliases).find(([, names]) => names.includes(normalized));
    if (!matchingAlias) return;
    const value = supplied[matchingAlias[0]];
    if (value !== undefined && value !== null && value !== '') {
      args[property] = value;
    }
  });

  const required = inputSchema?.required || [];
  const missing = required.filter((property) => !Object.hasOwn(args, property));
  if (missing.length > 0) {
    throw new Error('Swiggy tool requires unsupported arguments');
  }
  return args;
};

export const createSwiggyMcpClient = ({
  environment = 'production',
  endpoint,
  accessToken,
  fetchImpl = fetch,
}) => {
  let activeSession;
  let sessionPromise;
  let nextRequestId = 3;

  const startSession = async () => {
    if (!accessToken) {
      throw new Error('Swiggy access token is unavailable');
    }
    const config = {
      endpoint: endpoint || getSwiggyFoodEndpoint(environment),
      accessToken,
      fetchImpl,
    };
    const initialize = await readMcpResponse(await createMcpRequest(
      config,
      1,
      'initialize',
      {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'tulya-backend', version: '0.1.0' },
      },
    ));
    const sessionId = initialize.sessionId;

    await createMcpRequest(config, null, 'notifications/initialized', undefined, sessionId);
    const listed = await readMcpResponse(await createMcpRequest(
      config,
      2,
      'tools/list',
      {},
      sessionId,
    ));
    const activeSessionId = listed.sessionId || sessionId;
    const tools = listed.payload.result?.tools;
    if (!Array.isArray(tools)) {
      throw new Error('Swiggy MCP did not return its available tools');
    }

    return { tools, sessionId: activeSessionId };
  };

  const getSession = async () => {
    if (activeSession) return activeSession;
    if (!sessionPromise) sessionPromise = startSession();
    try {
      activeSession = await sessionPromise;
      return activeSession;
    } catch (error) {
      sessionPromise = undefined;
      throw error;
    }
  };

  const callTool = async (name, suppliedArguments = {}) => {
    const session = await getSession();
    const tool = session.tools.find((entry) => entry.name === name);
    if (!tool) {
      throw new Error(`Swiggy MCP does not expose ${name}`);
    }
    const args = buildFoodToolArguments(tool.inputSchema, suppliedArguments);
    const response = await readMcpResponse(await createMcpRequest(
      {
        endpoint: endpoint || getSwiggyFoodEndpoint(environment),
        accessToken,
        fetchImpl,
      },
      nextRequestId++,
      'tools/call',
      { name: tool.name, arguments: args },
      session.sessionId,
    ));
    return getToolPayload(response.payload.result);
  };

  return {
    callTool,

    async getAddresses(page = 1) {
      const result = await callTool('get_addresses', { page, pageSize: 10 });
      return result?.data ?? result;
    },

    async searchRestaurants({ addressId, query, offset }) {
      if (typeof addressId !== 'string' || !addressId.trim()) {
        throw new Error('A Swiggy search location is required');
      }
      if (typeof query !== 'string' || !query.trim()) {
        throw new Error('A restaurant search query is required');
      }
      const result = await callTool('search_restaurants', {
        addressId,
        query: query.trim(),
        ...(offset === undefined ? {} : { offset }),
      });
      return result?.data ?? result;
    },
  };
};

const getToolPayload = (result) => {
  if (result?.isError) throw new Error('Swiggy MCP tool call failed');
  const structured = result?.structuredContent;
  if (structured) {
    if (structured.success === false) {
      const error = new Error(structured.error?.message || structured.message || 'Swiggy MCP tool call failed');
      if (structured.error?.code === -32001) error.statusCode = 401;
      throw error;
    }
    return structured;
  }
  const text = result?.content?.find((item) => item.type === 'text')?.text;
  if (typeof text !== 'string') return result;
  const parsed = JSON.parse(text);
  if (parsed.success === false) {
    const error = new Error(parsed.error?.message || parsed.message || 'Swiggy MCP tool call failed');
    if (parsed.error?.code === -32001) error.statusCode = 401;
    throw error;
  }
  return parsed;
};
