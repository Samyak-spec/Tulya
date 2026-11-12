import { describe, expect, it } from 'vitest';
import { demoRestaurants } from '../data/demoRestaurants';
import {
  findManualEnrichment,
  findManualSearchMatch,
  getBestLinkedOffer,
  getManualProviderEntries,
  getPrimaryLiveOffers,
  getProvidersWithoutOffers,
  isPrimaryDineInOffer,
  mergeProviderOffers,
  selectBestOfferPerProvider,
} from './manualEnrichment';

const swiggy = (id, name, location, extra = {}) => ({
  id: `swiggy:${id}`,
  providerRestaurantId: id,
  providerIds: { swiggy: id },
  name,
  location,
  offers: [],
  ...extra,
});

const entryFor = (record, providerId) => getManualProviderEntries(record)
  .find((entry) => entry.providerId === providerId);

describe('manual provider enrichment', () => {
  it('picks the Best offer from the highest valid primary percentage across providers', () => {
    const offer = (providerKey, discountPercent, extra = {}) => ({
      providerKey, provider: providerKey, discountPercent, isVerified: true,
      deepLink: `https://${providerKey}.test/r`, offerText: 'Pre-booking', ...extra,
    });
    expect(getBestLinkedOffer([offer('swiggy', 25), offer('district', 20), offer('eazydiner', 10)]).providerKey).toBe('swiggy');
    expect(getBestLinkedOffer([offer('swiggy', 10), offer('district', 25), offer('eazydiner', 15)]).providerKey).toBe('district');
    expect(getBestLinkedOffer([
      offer('swiggy', 10),
      offer('district', 50, { offerText: 'Flat 50% cashback with bank card' }),
      offer('eazydiner', 40, { isTemporary: true, isVerified: false }),
    ]).providerKey).toBe('swiggy');
  });

  it('has all 10 supplied restaurant records', () => {
    expect(demoRestaurants).toHaveLength(10);
  });

  it('attaches Swiggy, District and EazyDiner offers with exact links to Basil', () => {
    const record = findManualEnrichment(swiggy('1101007', 'The Basil Cafe & Restro', 'Kalinga Nagar'));
    const entries = getManualProviderEntries(record);
    expect(entries.map((entry) => entry.providerId)).toEqual(['swiggy', 'district', 'eazydiner']);
    expect(entryFor(record, 'swiggy').deepLink).toBe(
      'https://www.swiggy.com/restaurants/bhubaneswar/kalinga-nagar/the-basil-cafe-and-restro-1101007/dineout',
    );
    expect(entryFor(record, 'district').deepLink).toBe(
      'https://www.district.in/dining/bhubaneswar/the-basil-cafe-restro-kalinga-nagar-bhubaneshwar',
    );
    expect(entryFor(record, 'eazydiner').deepLink).toBe(
      'https://www.eazydiner.com/bhubaneswar/the-basil-cafe-restro-kalinga-nagar-bhubaneswar-706561',
    );
    expect(entryFor(record, 'swiggy').offers.map((offer) => offer.discountPercent)).toEqual([20]);
    expect(entryFor(record, 'district').offers.map((offer) => offer.discountPercent)).toEqual([20, 10]);
    expect(entryFor(record, 'eazydiner').offers[0].discountPercent).toBe(10);
    expect(entries.flatMap((entry) => entry.offers).every((offer) => offer.deepLink)).toBe(true);
  });

  it('updates only Trident’s primary Swiggy offer', () => {
    const record = findManualEnrichment(
      swiggy('1084888', 'The Restaurant – Trident Bhubaneswar', 'Nayapalli'),
    );
    expect(entryFor(record, 'swiggy').offers.map(({ discountPercent }) => discountPercent))
      .toEqual([35, 20, 10]);
  });

  it('keeps every supplied provider URL unchanged for the ten target restaurants', () => {
    const expectedUrls = {
      birch: {
        swiggy: 'https://www.swiggy.com/restaurants/bhubaneswar/patia/birch-1066741/dineout',
        district: 'https://www.district.in/dining/bhubaneswar/birch-patia-bhubaneshwar',
        eazydiner: 'https://www.eazydiner.com/bhubaneswar/birch-patia-bhubaneshwar-705216',
      },
      'blanco-kitchen-terrace': {
        swiggy: 'https://www.swiggy.com/restaurants/bhubaneswar/saheed-nagar/blanco-kitchen-terrace-1351981/dineout',
        district: 'https://www.district.in/dining/bhubaneswar/blanco-sahid-nagar-bhubaneshwar',
        eazydiner: 'https://www.eazydiner.com/bhubaneswar/blanco-kitchen-terrace-shaheed-nagar-bhubaneswar-712605',
      },
      'restaurant-trident-bhubaneswar': {
        swiggy: 'https://www.swiggy.com/restaurants/bhubaneswar/nayapalli/the-restaurant-trident-bhubaneswar-1084888/dineout',
        district: 'https://www.district.in/dining/bhubaneswar/the-restaurant-trident-bhubaneshwar-nayapalli-bhubaneshwar',
        eazydiner: 'https://www.eazydiner.com/bhubaneswar/the-restaurant-trident-hotel-bhubaneswar-bhubaneswar-673839',
      },
      'nakli-dhaba-mayfair-lagoon': {
        swiggy: 'https://www.swiggy.com/restaurants/910230/dineout/menu',
        district: 'https://www.district.in/dining/bhubaneswar/nakli-dhaba-mayfair-lagoon-jayadev-vihar-bhubaneshwar',
        eazydiner: 'https://www.eazydiner.com/bhubaneswar/nakli-dhaba-mayfair-lagoon-bhubaneswar-695870',
      },
      'tea-pot-mayfair-lagoon': {
        swiggy: 'https://www.swiggy.com/restaurants/bhubaneswar/jayadev-vihar/tea-pot-mayfair-lagoon-910475/dineout',
        district: 'https://www.district.in/dining/bhubaneswar/tea-pot-mayfair-lagoon-jayadev-vihar-bhubaneshwar',
        eazydiner: 'https://www.eazydiner.com/bhubaneswar/tea-pot-mayfair-lagoon-bhubaneswar-695869',
      },
      'baron-baroness-mayfair-lagoon': {
        swiggy: 'https://www.swiggy.com/restaurants/bhubaneswar/jayadev-vihar/baron-baroness-mayfair-lagoon-927189/dineout',
        district: 'https://www.district.in/dining/bhubaneswar/baron-baroness-mayfair-lagoon-jayadev-vihar-bhubaneshwar',
        eazydiner: 'https://www.eazydiner.com/bhubaneswar/baron-baroness-mayfair-lagoon-bhubaneswar-696047',
      },
      'terra-rosso': {
        swiggy: 'https://www.swiggy.com/restaurants/bhubaneswar/kharvela-nagar/terra-rosso-665941/dineout',
        district: 'https://www.district.in/dining/bhubaneswar/terra-rosso-kharabela-nagar-bhubaneshwar',
        eazydiner: 'https://www.eazydiner.com/bhubaneswar/terra-rosso-kharvela-nagar-bhubaneswar-691545/menu',
      },
      'lyfe-kitchen-lyfe-hotel': {
        swiggy: 'https://www.swiggy.com/restaurants/lyfe-kitchen-lyfe-hotel-bapuji-nagar-bhubaneswar-915115/dineout',
        district: 'https://www.district.in/dining/bhubaneswar/lyfes-kitchen-sahid-nagar-bhubaneshwar',
        eazydiner: 'https://www.eazydiner.com/bhubaneswar/lyfe-kitchen-lyfe-bhubaneswar-hotel-bhubaneswar-694323/menu',
      },
      'barbeque-nation-triplex-mall': {
        swiggy: 'https://www.swiggy.com/restaurants/bhubaneswar/chandrasekharpur/barbeque-nation-886119/dineout',
        district: 'https://www.district.in/dining/bhubaneswar/barbeque-nation-chandrasekharpur-bhubaneshwar',
        eazydiner: 'https://www.eazydiner.com/bhubaneswar/barbeque-nation-bhubaneswar-662379',
      },
      'the-basil-cafe-restro': {
        swiggy: 'https://www.swiggy.com/restaurants/bhubaneswar/kalinga-nagar/the-basil-cafe-and-restro-1101007/dineout',
        district: 'https://www.district.in/dining/bhubaneswar/the-basil-cafe-restro-kalinga-nagar-bhubaneshwar',
        eazydiner: 'https://www.eazydiner.com/bhubaneswar/the-basil-cafe-restro-kalinga-nagar-bhubaneswar-706561',
      },
    };

    Object.entries(expectedUrls).forEach(([restaurantId, urls]) => {
      const record = demoRestaurants.find(({ id }) => id === `tulya:${restaurantId}`);
      expect(record).toBeDefined();
      expect(Object.fromEntries(getManualProviderEntries(record).map(({ providerId, deepLink }) => [
        providerId,
        deepLink,
      ]))).toEqual(urls);
    });
  });

  it('matches by name and locality without a provider ID', () => {
    const record = findManualEnrichment({
      id: 'x', name: 'The Restaurant - Trident Bhubaneswar', location: 'Nayapalli', address: 'Nayapalli, Bhubaneswar',
    });
    expect(record?.name).toBe('The Restaurant – Trident Bhubaneswar');
    expect(entryFor(record, 'district').deepLink).toBe(
      'https://www.district.in/dining/bhubaneswar/the-restaurant-trident-bhubaneshwar-nayapalli-bhubaneshwar',
    );
    expect(entryFor(record, 'swiggy').offers).toHaveLength(3);
  });

  it.each([
    ['The Restaurant – Trident Bhubaneswar', 'restaurant-trident-bhubaneswar'],
    ['Nakli Dhaba – Mayfair Lagoon', 'nakli-dhaba-mayfair-lagoon'],
    ['Tea Pot – Mayfair Lagoon', 'tea-pot-mayfair-lagoon'],
    ['Lyfe Kitchen – Lyfe Hotel', 'lyfe-kitchen-lyfe-hotel'],
    ['Barbeque Nation – Triplex Mall', 'barbeque-nation-triplex-mall'],
    ['The Basil Cafe & Restro', 'the-basil-cafe-restro'],
    ['Blanco Kitchen & Terrace', 'blanco-kitchen-terrace'],
    ['Terra Rosso', 'terra-rosso'],
    ['Baron & Baroness – Mayfair Lagoon', 'baron-baroness-mayfair-lagoon'],
    ['Birch', 'birch'],
  ])('resolves a specific query to canonical record: %s', (query, id) => {
    expect(findManualSearchMatch(query)?.canonicalRestaurantId).toBe(`tulya:${id}`);
  });

  it.each([
    ['Basil', 'the-basil-cafe-restro'],
    ['Basil Cafe', 'the-basil-cafe-restro'],
    ['Nakli Dhaba', 'nakli-dhaba-mayfair-lagoon'],
    ['Tea Pot', 'tea-pot-mayfair-lagoon'],
    ['Trident Bhubaneswar', 'restaurant-trident-bhubaneswar'],
    ['Baron and Baroness', 'baron-baroness-mayfair-lagoon'],
    ['Lyfe Kitchen', 'lyfe-kitchen-lyfe-hotel'],
    ['BBQ Nation Triplex Mall', 'barbeque-nation-triplex-mall'],
  ])('resolves the narrow alias %s to its canonical record', (query, id) => {
    expect(findManualSearchMatch(query)?.canonicalRestaurantId).toBe(`tulya:${id}`);
  });

  it('does not merge different restaurants', () => {
    expect(findManualEnrichment(swiggy('999', 'Basil Garden Biryani', 'Patia'))).toBeNull();
    expect(findManualEnrichment(swiggy('998', 'Random Pizza House', 'Kalinga Nagar'))).toBeNull();
    expect(findManualEnrichment(swiggy('887', 'Barbeque Nation', 'Patia'))).toBeNull();
    expect(findManualEnrichment(swiggy('887', 'Barbeque Nation', ''))).toBeNull();
  });

  it('keeps provider URLs without offers and does not invent offers', () => {
    const record = findManualEnrichment(swiggy('886119', 'Barbeque Nation', 'Chandrasekharpur'));
    const entries = getManualProviderEntries(record);
    expect(entries.length).toBeGreaterThan(0);
    entries.forEach((entry) => {
      expect(entry.deepLink).toMatch(/^https:\/\//);
    });
    expect(entryFor(record, 'swiggy').offers).toEqual([]);
    expect(entryFor(record, 'district').offers.map(({ discountPercent }) => discountPercent)).toEqual([10]);
    expect(entryFor(record, 'eazydiner').offers).toEqual([]);
  });

  it('never exposes cashback/bank/card offers as primary offers', () => {
    const record = findManualEnrichment(swiggy('665941', 'Terra Rosso', 'Kharvela Nagar'));
    expect(getManualProviderEntries(record).flatMap((entry) => entry.offers)).toEqual([]);
    const all = demoRestaurants.flatMap((item) => getManualProviderEntries(item)).flatMap((entry) => entry.offers);
    expect(all.some((offer) => /cashback|bank|card/i.test(offer.title))).toBe(false);
  });

  it('retains the canonical rating separately from provider ratings', () => {
    const record = findManualEnrichment(swiggy('910230', 'Nakli Dhaba - Mayfair Lagoon', 'Jayadev Vihar'));
    expect(record.canonicalRating).toBe(4.2);
    const basil = findManualEnrichment(swiggy('1101007', 'The Basil Cafe & Restro', 'Kalinga Nagar'));
    expect(basil.canonicalRating).toBe(4.6);
    expect(basil.providerRatings).toEqual({ swiggy: 4.6, district: 4.6, eazydiner: 4.6 });
  });

  it('preserves the supplied primary offers for all enriched restaurants', () => {
    const counts = Object.fromEntries(demoRestaurants.map((restaurant) => [
      restaurant.id.replace(/^tulya:/, ''),
      Object.fromEntries(getManualProviderEntries(restaurant).map((entry) => [
        entry.providerId,
        entry.offers.length,
      ])),
    ]));

    expect(counts['the-basil-cafe-restro']).toEqual({ swiggy: 1, district: 2, eazydiner: 1 });
    expect(counts['restaurant-trident-bhubaneswar']).toEqual({ swiggy: 3, district: 3, eazydiner: 2 });
    expect(counts['nakli-dhaba-mayfair-lagoon']).toEqual({ swiggy: 2, district: 2, eazydiner: 2 });
    expect(counts['tea-pot-mayfair-lagoon']).toEqual({ swiggy: 2, district: 2, eazydiner: 2 });
    expect(counts['barbeque-nation-triplex-mall']).toEqual({ swiggy: 0, district: 1, eazydiner: 0 });
    expect(counts['lyfe-kitchen-lyfe-hotel']).toEqual({ swiggy: 1, district: 0, eazydiner: 0 });
    expect(counts['terra-rosso']).toEqual({ swiggy: 0, district: 0, eazydiner: 0 });
    expect(counts['baron-baroness-mayfair-lagoon']).toEqual({ swiggy: 2, district: 2, eazydiner: 2 });
    expect(counts.birch).toEqual({ swiggy: 0, district: 2, eazydiner: 1 });
    expect(counts['blanco-kitchen-terrace']).toEqual({ swiggy: 1, district: 1, eazydiner: 1 });
  });

  it('keeps the requested provider-specific primary offer values and no-offer states', () => {
    const providerDiscounts = (id, providerId) => {
      const record = demoRestaurants.find((restaurant) => restaurant.id === `tulya:${id}`);
      return entryFor(record, providerId)?.offers.map(({ discountPercent }) => discountPercent) || [];
    };

    expect(providerDiscounts('birch', 'swiggy')).toEqual([]);
    expect(providerDiscounts('birch', 'district')).toEqual([10, 20]);
    expect(providerDiscounts('birch', 'eazydiner')).toEqual([10]);
    expect(providerDiscounts('blanco-kitchen-terrace', 'swiggy')).toEqual([20]);
    expect(providerDiscounts('blanco-kitchen-terrace', 'district')).toEqual([20]);
    expect(providerDiscounts('blanco-kitchen-terrace', 'eazydiner')).toEqual([10]);
    expect(providerDiscounts('barbeque-nation-triplex-mall', 'swiggy')).toEqual([]);
    expect(providerDiscounts('barbeque-nation-triplex-mall', 'district')).toEqual([10]);
    expect(providerDiscounts('barbeque-nation-triplex-mall', 'eazydiner')).toEqual([]);
    expect(providerDiscounts('terra-rosso', 'swiggy')).toEqual([]);
    expect(providerDiscounts('terra-rosso', 'district')).toEqual([]);
    expect(providerDiscounts('terra-rosso', 'eazydiner')).toEqual([]);
    expect(providerDiscounts('lyfe-kitchen-lyfe-hotel', 'district')).toEqual([]);
    expect(providerDiscounts('lyfe-kitchen-lyfe-hotel', 'eazydiner')).toEqual([]);
  });

  it('preserves live and manual offers from every provider and exact manual links', () => {
    const record = findManualEnrichment(swiggy('1101007', 'The Basil Cafe & Restro', 'Kalinga Nagar'));
    const entries = getManualProviderEntries(record);
    const liveOffers = [
      {
        provider: 'swiggy_dineout',
        offerType: 'table-booking',
        offerText: 'Live Swiggy deal',
        isVerified: true,
        deepLink: 'https://provider.example/live',
      },
      {
        provider: 'district',
        offerType: 'dine-in',
        offerText: 'Live District deal',
        isVerified: true,
      },
      {
        provider: 'eazydiner',
        offerType: 'table-booking',
        offerText: 'Live EazyDiner deal',
        isVerified: true,
      },
    ];
    const merged = mergeProviderOffers(liveOffers, entries);
    const offersForProvider = (providerId) => merged.filter((offer) => (
      offer.providerKey === providerId
      || String(offer.provider).toLowerCase().replace(/_?dineout$/, '') === providerId
    ));

    expect(merged).toHaveLength(7);
    expect(offersForProvider('swiggy')).toHaveLength(2);
    expect(offersForProvider('district')).toHaveLength(3);
    expect(offersForProvider('eazydiner')).toHaveLength(2);
    expect(merged.find(({ offerText }) => offerText === 'Live Swiggy deal').deepLink)
      .toBe(entryFor(record, 'swiggy').deepLink);
    expect(mergeProviderOffers([], entries)).toHaveLength(4);
  });

  it('keeps manual offers when provider results are empty and reports linked providers without offers', () => {
    const record = findManualEnrichment(swiggy('886119', 'Barbeque Nation', 'Chandrasekharpur'));
    const entries = getManualProviderEntries(record);

    expect(mergeProviderOffers([], entries).map(({ discountPercent }) => discountPercent)).toEqual([10]);
    expect(getProvidersWithoutOffers([], entries).map(({ providerId }) => providerId))
      .toEqual(['swiggy', 'eazydiner']);
  });

  it('selects the highest verified linked discount and skips missing or unverified links', () => {
    expect(getBestLinkedOffer([
      { isVerified: true, discountPercent: 10, deepLink: 'https://eazydiner.example' },
      { isVerified: true, discountPercent: 25, deepLink: 'https://swiggy.example' },
      { isVerified: false, discountPercent: 90, deepLink: 'https://unverified.example' },
      { isVerified: true, discountPercent: 100, deepLink: null },
    ])).toMatchObject({
      discountPercent: 25,
      deepLink: 'https://swiggy.example',
    });
    expect(getBestLinkedOffer([])).toBeNull();
  });

  it('selects one highest verified primary offer per provider, preserving selected offer data and URLs', () => {
    const record = demoRestaurants.find(({ id }) => id === 'tulya:baron-baroness-mayfair-lagoon');
    const manualEntries = getManualProviderEntries(record);
    const merged = mergeProviderOffers([
      {
        provider: 'swiggy_dineout',
        providerKey: 'swiggy',
        offerType: 'table-booking',
        offerText: '10% OFF walk-in',
        discountPercent: 10,
        isVerified: true,
        deepLink: 'https://not-the-supplied-link.example',
      },
      {
        provider: 'swiggy_dineout',
        providerKey: 'swiggy',
        offerType: 'table-booking',
        offerText: '25% cashback on HDFC card',
        discountPercent: 25,
        isVerified: true,
        deepLink: 'https://cashback.example',
      },
    ], manualEntries);
    const selected = selectBestOfferPerProvider(merged);

    expect(selected.map(({ providerKey }) => providerKey)).toEqual([
      'swiggy',
      'district',
      'eazydiner',
    ]);
    expect(selected).toHaveLength(3);
    expect(selected.map(({ discountPercent }) => discountPercent)).toEqual([20, 20, 20]);
    expect(selected.every(({ deepLink }) => deepLink)).toBe(true);
    expect(selected.find(({ providerKey }) => providerKey === 'swiggy')).toMatchObject({
      title: '20% OFF',
      bookingRequired: true,
      deepLink: entryFor(record, 'swiggy').deepLink,
    });
  });

  it('picks the highest discount regardless of offer ordering and filters unverified/payment offers', () => {
    const selected = selectBestOfferPerProvider([
      { provider: 'Swiggy', offerText: '10% OFF', discountPercent: 10, isVerified: true },
      { provider: 'Swiggy', offerText: '25% OFF', discountPercent: 25, isVerified: true },
      { provider: 'Swiggy', offerText: '20% OFF', discountPercent: 20, isVerified: true },
      { provider: 'District', offerText: '25% OFF bank offer', discountPercent: 25, isVerified: true },
      { provider: 'District', offerText: '20% OFF', discountPercent: 20, isVerified: false },
      { provider: 'EazyDiner', offerText: '15% cashback', discountPercent: 15, isVerified: true },
      { provider: 'EazyDiner', offerText: '12% OFF', discountPercent: 12, isVerified: true },
    ]);

    expect(selected).toHaveLength(2);
    expect(selected.find(({ provider }) => provider === 'Swiggy').discountPercent).toBe(25);
    expect(selected.find(({ provider }) => provider === 'EazyDiner').discountPercent).toBe(12);
    expect(selected.some(({ provider }) => provider === 'District')).toBe(false);
  });

  it('prefers broader applicability when discounts are equal', () => {
    const selected = selectBestOfferPerProvider([
      {
        provider: 'District',
        discountPercent: 20,
        bookingRequired: true,
        eligibility: ['Reservation required'],
        isVerified: true,
      },
      {
        provider: 'District',
        discountPercent: 20,
        bookingRequired: false,
        eligibility: [],
        isVerified: true,
      },
    ]);

    expect(selected).toHaveLength(1);
    expect(selected[0].bookingRequired).toBe(false);
  });

  it('rejects payment promotions from live and manual primary offers', () => {
    expect(isPrimaryDineInOffer({
      offerType: 'table-booking',
      offerText: '10% cashback with HDFC credit card',
      isVerified: true,
    })).toBe(false);
    expect(getPrimaryLiveOffers([
      {
        provider: 'swiggy_dineout',
        offerType: 'table-booking',
        offerText: '10% cashback with HDFC credit card',
        isVerified: true,
      },
    ])).toEqual([]);
  });
});
