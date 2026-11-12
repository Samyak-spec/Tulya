import { createAuthorizedPartnerProvider } from './authorizedPartnerProvider.js';

export const createEazyDinerProvider = ({ getAuthorizedOffers } = {}) => {
  return createAuthorizedPartnerProvider('eazydiner', getAuthorizedOffers);
};
