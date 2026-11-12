import { describe, expect, it } from 'vitest';
import { demoRestaurants } from '../data/demoRestaurants';
import {
  getBestLinkedOffer,
  getManualProviderEntries,
  findManualEnrichment,
  mergeProviderOffers,
  selectBestOfferPerProvider,
} from './manualEnrichment';
import { createSyntheticFallbackOffers, isProtectedRestaurant } from './syntheticOffers';

const basil = { id: 'swiggy:1101007', providerRestaurantId: '1101007', providerIds: { swiggy: '1101007' }, name: 'The Basil Cafe & Restro', location: 'Kalinga Nagar' };
const liveRestaurant = { id: 'swiggy:999', name: 'Some Other Bistro', location: 'Patia' };
const realOffer = (providerKey, provider, discountPercent) => ({
  providerKey,
  provider,
  discountPercent,
  offerType: 'dine-in',
  isVerified: true,
  deepLink: `https://${providerKey}.example/real`,
});

describe('synthetic fallback offers', () => {
  it('gives a non-protected restaurant one temporary offer per provider', () => {
    const offers = createSyntheticFallbackOffers(liveRestaurant, []);
    expect(offers.map((offer) => offer.providerKey)).toEqual(['swiggy', 'district', 'eazydiner']);
    offers.forEach((offer) => {
      expect(offer.isTemporary).toBe(true);
      expect(offer.isVerified).toBe(false);
      expect([10, 15, 20, 25]).toContain(offer.discountPercent);
      expect(offer.deepLink).toBeNull();
    });
    expect(createSyntheticFallbackOffers(liveRestaurant, [])).toEqual(offers);
  });

  it('never replaces a real offer and keeps at most one offer per provider', () => {
    const real = [realOffer('swiggy', 'Swiggy', 20)];
    const synthetic = createSyntheticFallbackOffers(liveRestaurant, real);
    expect(synthetic.map((offer) => offer.providerKey)).toEqual(['district', 'eazydiner']);
    const all = [...real, ...synthetic];
    expect(new Set(all.map((offer) => offer.providerKey)).size).toBe(all.length);
  });

  it('reuses an existing exact provider URL and does not invent others', () => {
    const [swiggy, district] = createSyntheticFallbackOffers(
      liveRestaurant,
      [],
      [{ provider: 'Swiggy Dineout', deepLink: 'https://www.swiggy.com/exact' }],
    );
    expect(swiggy.deepLink).toBe('https://www.swiggy.com/exact');
    expect(district.deepLink).toBeNull();
  });

  it('never generates offers for any of the 10 protected restaurants', () => {
    expect(demoRestaurants).toHaveLength(10);
    demoRestaurants.forEach((record) => {
      const restaurant = { id: `tulya:${record.id}`, name: record.name, location: record.location };
      expect(isProtectedRestaurant(restaurant)).toBe(true);
      expect(createSyntheticFallbackOffers(restaurant, [])).toEqual([]);
    });
  });

  it('leaves protected restaurant offers and URLs unchanged', () => {
    const record = findManualEnrichment(basil);
    const entries = getManualProviderEntries(record);
    expect(entries.find((entry) => entry.providerId === 'swiggy').deepLink).toBe(
      'https://www.swiggy.com/restaurants/bhubaneswar/kalinga-nagar/the-basil-cafe-and-restro-1101007/dineout',
    );
    const real = selectBestOfferPerProvider(mergeProviderOffers([], entries));
    expect(real).toHaveLength(3);
    expect(createSyntheticFallbackOffers(basil, real)).toEqual([]);
  });

  it('does not let synthetic offers override real Best offer ranking', () => {
    const real = [realOffer('district', 'District', 10)];
    const synthetic = createSyntheticFallbackOffers(liveRestaurant, real, real)
      .map((offer) => ({ ...offer, deepLink: 'https://synthetic.example', discountPercent: 25 }));
    expect(getBestLinkedOffer([...real, ...synthetic]).providerKey).toBe('district');
    expect(selectBestOfferPerProvider([...real, ...synthetic])).toEqual(real);
  });
});
