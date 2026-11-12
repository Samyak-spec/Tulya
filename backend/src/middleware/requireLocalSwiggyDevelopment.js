import { env } from '../config/env.js';

const isLoopbackAddress = (address) => (
  address === '::1'
  || address === '127.0.0.1'
  || address === '::ffff:127.0.0.1'
);

export const requireLocalSwiggyDevelopment = (req, res, next) => {
  const address = req.socket.remoteAddress;
  if (env.NODE_ENV !== 'development' || !isLoopbackAddress(address)) {
    return res.status(404).json({ success: false, message: 'Not found' });
  }
  return next();
};
