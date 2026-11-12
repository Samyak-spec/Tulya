import { describe, expect, it, vi } from 'vitest';
import { buildComparisonResult } from '../src/services/dealService.js';
import { createEazyDinerProvider } from '../src/providers/eazyDinerProvider.js';
import { createAuthorizedPartnerProvider } from '../src/providers/authorizedPartnerProvider.js';
import { normalizeOffer } from '../src/providers/offerSchema.js';
import { matchProviderRestaurant } from '../src/providers/restaurantMatching.js';
import { createProviderResult } from '../src/providers/providerResult.js';
import { createSwiggyProvider } from '../src/providers/swiggyProvider.js';
import { createZomatoProvider } from '../src/providers/zomatoProvider.js';

const swiggyRestaurant = {
  id: 'swiggy:midnight-spice',
  canonicalRestaurantId: 'swiggy:midnight-spice',
  name: 'Midnight Spice',
  location: 'Sample District',
  address: '12 Market Road, Bengaluru',
  latitude: 12.9352,
  longitude: 77.6245,
  providerIds: { swiggy: 'swiggy-midnight-spice' },
};

describe('normalized restaurant provider offers', () => {
  it('matches provider listings to the Swiggy catalogue record by name and location, not just name', () => {
    const matched = matchProviderRestaurant(swiggyRestaurant, {
      id: 'zomato-midnight-spice',
      name: 'Midnight Spice',
      address: '12 Market Road, Bengaluru',
    }, 'zomato');
    const mismatched = matchProviderRestaurant(swiggyRestaurant, {
      id: 'wrong-restaurant',
      name: 'Midnight Spice',
      areaName: 'Whitefield',
    }, 'zomato');

    expect(matched.matched).toBe(true);
    expect(matched.reason).toBe('name_and_address');
    expect(mismatched.matched).toBe(false);
  });

  it('uses both Dineout locality and area as matching evidence', () => {
    const matched = matchProviderRestaurant({
      ...swiggyRestaurant,
      address: '12 Market Road, Bengaluru',
      location: 'Central District',
    }, {
      id: 'dineout-midnight-spice',
      name: 'Midnight Spice',
      locality: 'Bengaluru',
      area: 'Central District',
    }, 'swiggy');

    expect(matched).toMatchObject({ matched: true, reason: 'name_and_address' });
  });

  it('keeps Zomato and EazyDiner unavailable without authorized partner access', async () => {
    const results = await Promise.all([
      createZomatoProvider().getOffers(swiggyRestaurant),
      createEazyDinerProvider().getOffers(swiggyRestaurant),
    ]);

    expect(results.map(({ provider, status, offers }) => ({ provider, status, offers }))).toEqual([
      { provider: 'zomato', status: 'unavailable', offers: [] },
      { provider: 'eazydiner', status: 'unavailable', offers: [] },
    ]);
  });

  it('rejects outbound links outside the provider domain', () => {
    const offer = normalizeOffer('eazydiner', swiggyRestaurant.id, {
      offerType: 'dine-in',
      originalPrice: 1000,
      discount: 100,
      finalPrice: 900,
      offerText: 'Verified offer',
      deepLink: 'https://example.com/phishing',
    }, { isVerified: true });

    expect(offer.deepLink).toBeNull();
  });

  it('normalizes only price-comparable dine-in partner offers', async () => {
    const provider = createAuthorizedPartnerProvider('eazydiner', async () => ({
      restaurant: {
        name: 'Midnight Spice',
        address: '12 Market Road, Bengaluru',
      },
      offers: [
        {
          offerType: 'dine-in',
          originalPrice: 1100,
          discount: 220,
          finalPrice: 880,
          offerText: 'Save ₹220',
          deepLink: 'https://eazydiner.com/restaurants/midnight-spice',
        },
        {
          offerType: 'delivery',
          originalPrice: 1100,
          discount: 100,
          offerText: 'No final price supplied',
        },
      ],
    }));

    const result = await provider.getOffers(swiggyRestaurant);
    expect(result.status).toBe('verified');
    expect(result.offers).toHaveLength(1);
    expect(result.offers[0]).toMatchObject({
      provider: 'eazydiner',
      restaurantId: swiggyRestaurant.id,
      offerType: 'dine-in',
      originalPrice: 1100,
      discount: 220,
      finalPrice: 880,
      isVerified: true,
      deepLink: 'https://eazydiner.com/restaurants/midnight-spice',
    });
  });

  it('does not use Swiggy food-order coupons as dining offers', async () => {
    const fetchFoodCoupons = vi.fn();
    const result = await createSwiggyProvider({
      client: { fetchFoodCoupons },
    }).getOffers(swiggyRestaurant);

    expect(result).toMatchObject({
      provider: 'swiggy_dineout',
      status: 'unavailable',
      offers: [],
    });
    expect(fetchFoodCoupons).not.toHaveBeenCalled();
  });

  it('retrieves verified Dineout deals and live slots without treating cover charge as a bill price', async () => {
    const restaurant = { ...swiggyRestaurant, address: 'Sample District' };
    const dineoutClient = {
      searchRestaurants: vi.fn().mockResolvedValue({
        success: true,
        data: {
          statusCode: 200,
          data: {
            restaurants: [{
              id: 'dineout-restaurant-id',
              name: 'Midnight Spice',
              locality: 'Sample District',
              area: 'Sample District',
            }],
          },
        },
      }),
      getRestaurantDetails: vi.fn().mockResolvedValue({
        success: true,
        data: {
          statusCode: 200,
          data: {
            restaurant: {
              restaurantId: 'dineout-restaurant-id',
              deals: [
                {
                  id: 'dinner-deal',
                  title: 'Dinner dining deal',
                  discountPercentage: 20,
                  coverCharge: 200,
                  slotGroupName: 'Dinner',
                  offerCategory: 'prebooking',
                },
                {
                  id: 'walkin-deal',
                  title: 'Walk-in dining deal',
                  discountPercentage: 10,
                  coverCharge: 0,
                  offerCategory: 'walkin',
                },
                {
                  id: 'delivery-coupon',
                  title: 'Delivery discount',
                  discountAmount: 400,
                  offerCategory: 'delivery',
                },
                {
                  id: 'cod-coupon',
                  title: 'Cash on delivery coupon',
                  discountAmount: 250,
                  offerType: 'cod',
                },
              ],
            },
          },
        },
      }),
      getAvailableSlots: vi.fn().mockResolvedValue({
        success: true,
        data: {
          slots: [
            {
              dateStr: '2026-04-20',
              displayTime: '7:00 PM',
              slotGroupName: 'Dinner',
              availableInventory: 2,
              deals: [{
                title: 'Dinner dining deal',
                discountPercentage: 20,
                availableInventory: 2,
              }],
            },
            {
              dateStr: '2026-04-20',
              displayTime: '8:00 PM',
              slotGroupName: 'Dinner',
              availableInventory: 0,
              deals: [{ title: 'Unavailable deal', discountPercentage: 90 }],
            },
          ],
        },
      }),
    };
    const session = { createDineoutClient: () => dineoutClient };
    const userLocation = { latitude: 12.9352, longitude: 77.6245 };

    const comparison = await buildComparisonResult(
      restaurant,
      {},
      undefined,
      { swiggySession: session, userLocation },
    );

    expect(dineoutClient.searchRestaurants).toHaveBeenCalledWith({
      latitude: 12.9352,
      longitude: 77.6245,
      query: 'Midnight Spice',
    });
    expect(dineoutClient.getRestaurantDetails).toHaveBeenCalledWith({
      restaurantId: 'dineout-restaurant-id',
      latitude: 12.9352,
      longitude: 77.6245,
    });
    expect(dineoutClient.getAvailableSlots).toHaveBeenCalledWith(expect.objectContaining({
      restaurantId: 'dineout-restaurant-id',
      latitude: 12.9352,
      longitude: 77.6245,
      date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    }));
    expect(comparison.offers).toHaveLength(2);
    expect(comparison.offers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        provider: 'swiggy_dineout',
        providerRestaurantId: 'dineout-restaurant-id',
        offerType: 'table-booking',
        offerText: '20% discount — Dinner dining deal',
        providerOfferId: 'dinner-deal',
        providerDetails: expect.objectContaining({
          discountPercentage: 20,
          coverCharge: 200,
          offerCategory: 'prebooking',
        }),
        originalPrice: null,
        discount: null,
        finalPrice: null,
        verified: true,
        eligibility: expect.arrayContaining(['Dinner', '2026-04-20', '7:00 PM']),
      }),
      expect.objectContaining({
        provider: 'swiggy_dineout',
        providerRestaurantId: 'dineout-restaurant-id',
        offerType: 'dine-in',
        offerText: '10% discount — Walk-in dining deal',
        originalPrice: null,
        discount: null,
        finalPrice: null,
        verified: true,
      }),
    ]));
    expect(comparison.offers.some((offer) => offer.offerText.includes('Unavailable deal'))).toBe(false);
    expect(comparison.providerIds.swiggyDineout).toBe('dineout-restaurant-id');
    expect(comparison.bestOffer).toBeNull();
  });

  it('retains verified live offers when Dineout slot availability cannot be retrieved', async () => {
    const dineoutClient = {
      searchRestaurants: vi.fn().mockResolvedValue({
        data: {
          restaurants: [{
            id: 'dineout-restaurant-id',
            name: 'Midnight Spice',
            locality: 'Sample District',
            area: 'Sample District',
          }],
        },
      }),
      getRestaurantDetails: vi.fn().mockResolvedValue({
        data: {
          restaurant: {
            deals: [{
              id: 'live-offer-id',
              title: 'Current dining deal',
              description: 'Valid for dinner',
              discountPercentage: 15,
              minimumSpend: 500,
              terms: ['Dine in only'],
              validity: 'Today',
              deepLink: 'https://www.swiggy.com/dineout/restaurant',
            }],
          },
        },
      }),
      getAvailableSlots: vi.fn().mockRejectedValue(new Error('slot lookup unavailable')),
    };
    const result = await createSwiggyProvider({
      session: { createDineoutClient: () => dineoutClient },
      userLocation: { latitude: 12.9352, longitude: 77.6245 },
    }).getOffers(swiggyRestaurant);

    expect(result).toMatchObject({
      provider: 'swiggy_dineout',
      status: 'verified',
      message: expect.stringContaining('live table availability could not be checked'),
      providerRestaurantId: 'dineout-restaurant-id',
    });
    expect(result.offers[0]).toMatchObject({
      provider: 'swiggy_dineout',
      providerOfferId: 'live-offer-id',
      offerText: '15% discount — Current dining deal — Valid for dinner',
      terms: ['Dine in only'],
      deepLink: 'https://www.swiggy.com/dineout/restaurant',
      isVerified: true,
      providerDetails: expect.objectContaining({
        minimumSpend: 500,
        validity: 'Today',
      }),
    });
  });

  it('selects the lowest verified final price and ignores unverified mock values', async () => {
    const offers = [
      normalizeOffer('swiggy', swiggyRestaurant.id, {
        offerType: 'dine-in',
        originalPrice: 1100, discount: 140, finalPrice: 960, offerText: 'Swiggy deal',
      }, { isVerified: true }),
      normalizeOffer('zomato', swiggyRestaurant.id, {
        offerType: 'dine-in',
        originalPrice: 1100, discount: 100, finalPrice: 1000, offerText: 'Zomato deal',
      }, { isVerified: true }),
      normalizeOffer('eazydiner', swiggyRestaurant.id, {
        offerType: 'dine-in',
        originalPrice: 1100, discount: 220, finalPrice: 880, offerText: 'EazyDiner deal',
        deepLink: 'https://eazydiner.com/deal',
      }, { isVerified: true }),
      normalizeOffer('zomato', swiggyRestaurant.id, {
        offerType: 'dine-in',
        originalPrice: 1100, discount: 1000, finalPrice: 100, offerText: 'Mock deal',
      }),
      normalizeOffer('swiggy', swiggyRestaurant.id, {
        offerType: 'delivery',
        originalPrice: 1100, discount: 1000, finalPrice: 100, offerText: 'Delivery deal',
      }, { isVerified: true }),
    ];
    const providerResults = [
      createProviderResult('swiggy', 'verified', [offers[0]]),
      createProviderResult('zomato', 'verified', [offers[1], offers[3]]),
      createProviderResult('eazydiner', 'verified', [offers[2]]),
      createProviderResult('swiggy', 'verified', [offers[4]]),
    ];

    const comparison = await buildComparisonResult(swiggyRestaurant, {}, providerResults);
    expect(comparison.bestOffer).toMatchObject({
      provider: 'eazydiner',
      finalPrice: 880,
      savings: 220,
      isBest: true,
    });
    expect(comparison.offers.some((offer) => offer.offerText === 'Mock deal')).toBe(false);
    expect(comparison.offers.some((offer) => offer.offerType === 'delivery')).toBe(false);
  });
});
