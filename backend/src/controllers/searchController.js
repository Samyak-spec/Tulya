export const searchController = async (req, res, next) => {
  const error = new Error('Use authenticated restaurant catalogue search for discovery');
  error.statusCode = 410;
  return next(error);
};
