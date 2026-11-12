import { z } from 'zod';

export const providerNames = ['swiggy', 'swiggy_dineout', 'zomato', 'eazydiner'];

export const normalizedOfferSchema = z.object({
  provider: z.enum(providerNames),
  restaurantId: z.string().min(1),
  providerRestaurantId: z.string().min(1).nullable().optional(),
  providerOfferId: z.string().min(1).nullable().optional(),
  providerDetails: z.record(z.unknown()).optional(),
  offerType: z.enum(['dine-in', 'table-booking']).nullable().default(null),
  originalPrice: z.number().nonnegative().nullable(),
  discount: z.number().nonnegative().nullable(),
  finalPrice: z.number().nonnegative().nullable(),
  offerText: z.string().trim().min(1),
  code: z.string().trim().nullable(),
  terms: z.array(z.string().trim()).default([]),
  eligibility: z.array(z.string().trim()).default([]),
  deepLink: z.string().url().nullable(),
  isVerified: z.boolean(),
}).superRefine((offer, context) => {
  if (offer.discount !== null && offer.originalPrice !== null && offer.discount > offer.originalPrice) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Discount cannot exceed the original price',
      path: ['discount'],
    });
  }
  if (offer.finalPrice !== null && offer.originalPrice !== null && offer.finalPrice > offer.originalPrice) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Final price cannot exceed the original price',
      path: ['finalPrice'],
    });
  }
});

export const providerResultSchema = z.object({
  provider: z.enum(providerNames),
  status: z.enum(['verified', 'mock', 'unavailable', 'error']),
  providerRestaurantId: z.string().min(1).optional(),
  offers: z.array(normalizedOfferSchema),
  message: z.string().optional(),
});

export const normalizeOffer = (provider, restaurantId, offer, { isVerified = false } = {}) => {
  const asOptionalAmount = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const amount = Number(value);
    return Number.isFinite(amount) ? amount : null;
  };
  const originalPrice = asOptionalAmount(offer.originalPrice ?? offer.original_price ?? offer.originalAmount);
  const discount = asOptionalAmount(offer.discount ?? offer.discount_amount ?? offer.discountAmount);
  const finalPrice = asOptionalAmount(offer.finalPrice ?? offer.final_price ?? offer.effectivePrice ?? offer.finalAmount);
  const providerRestaurantId = offer.providerRestaurantId ?? offer.restaurantId;
  const code = offer.code ?? offer.couponCode;
  const rawLink = offer.deepLink ?? offer.url ?? null;
  let deepLink = null;
  if (typeof rawLink === 'string' && rawLink.startsWith('https://')) {
    try {
      const hostname = new URL(rawLink).hostname.toLowerCase();
      const trustedDomains = {
        swiggy: ['swiggy.com', 'swiggy.in'],
        swiggy_dineout: ['swiggy.com', 'swiggy.in'],
        zomato: ['zomato.com'],
        eazydiner: ['eazydiner.com'],
      }[provider];
      if (trustedDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) {
        deepLink = rawLink;
      }
    } catch {
      deepLink = null;
    }
  }

  return normalizedOfferSchema.parse({
    provider,
    restaurantId,
    providerRestaurantId: providerRestaurantId == null ? null : String(providerRestaurantId),
    providerOfferId: offer.providerOfferId == null ? null : String(offer.providerOfferId),
    ...(offer.providerDetails && typeof offer.providerDetails === 'object'
      ? { providerDetails: offer.providerDetails }
      : {}),
    offerType: ['dine-in', 'table-booking'].includes(offer.offerType) ? offer.offerType : null,
    originalPrice,
    discount,
    finalPrice,
    offerText: String(offer.offerText ?? offer.title ?? offer.description ?? ''),
    code: code == null ? null : String(code),
    terms: Array.isArray(offer.terms) ? offer.terms.map(String) : offer.terms ? [String(offer.terms)] : [],
    eligibility: Array.isArray(offer.eligibility)
      ? offer.eligibility.map(String)
      : offer.eligibility
        ? [String(offer.eligibility)]
        : [],
    deepLink,
    isVerified,
  });
};
