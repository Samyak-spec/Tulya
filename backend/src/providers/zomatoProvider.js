import { createAuthorizedPartnerProvider } from './authorizedPartnerProvider.js';

export const createZomatoProvider = ({ getAuthorizedOffers } = {}) => {
  return createAuthorizedPartnerProvider('zomato', getAuthorizedOffers);
};
