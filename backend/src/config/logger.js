const formatTimestamp = () => new Date().toISOString();

const baseLog = (level, message, meta = {}) => {
  const payload = {
    timestamp: formatTimestamp(),
    level,
    message,
    ...(Object.keys(meta).length > 0 ? { meta } : {}),
  };

  console.log(JSON.stringify(payload));
};

export const logger = {
  info: (message, meta) => baseLog('info', message, meta),
  warn: (message, meta) => baseLog('warn', message, meta),
  error: (message, meta) => baseLog('error', message, meta),
};
