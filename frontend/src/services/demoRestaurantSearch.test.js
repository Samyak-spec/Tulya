import { describe, expect, it } from 'vitest';
import { demoOfferList, demoRestaurants } from '../data/demoRestaurants';
import {
  getCatalogueSearchText,
  getDemoBestOffer,
  getDemoSuggestions,
  parseDemoSearchIntent,
  searchDemoRestaurants,
} from './demoRestaurantSearch';

describe('restaurant search intent and local enrichment matching', () => {
  it.each([
    'basil',
    'basill',
    'basil-cafe',
    'basil cafe',
    'the basil cafe',
    'basil cafe and restro',
    'restraunt basil',
    'resturant basil',
    'restaurent basil',
  ])('matches the enriched Basil record for %s', (query) => {
    expect(searchDemoRestaurants(query)[0]?.name).toBe('The Basil Cafe & Restro');
  });

  it.each([
    ['baron baroness', 'Baron & Baroness – Mayfair Lagoon'],
    ['baron & baroness', 'Baron & Baroness – Mayfair Lagoon'],
    ['baron-and-baroness', 'Baron & Baroness – Mayfair Lagoon'],
    ['baron and baroness', 'Baron & Baroness – Mayfair Lagoon'],
    ['bbq nation', 'Barbeque Nation – Triplex Mall'],
  ])('normalizes restaurant query %s', (query, expectedName) => {
    expect(searchDemoRestaurants(query).map(({ name }) => name)).toContain(expectedName);
  });

  it.each([
    ['chinise restaurant', 'chinese', null, null, null, 'chinese restaurants'],
    ['chinese', 'chinese', null, null, null, 'chinese restaurants'],
    ['north indian for 5 people under 3k', 'north indian', 5, 3000, null, 'north indian restaurants'],
    ['chinese restaurant for 5 people under 3000', 'chinese', 5, 3000, null, 'chinese restaurants'],
    ['italian under 2000', 'italian', null, 2000, null, 'italian restaurants'],
    ['chinese restaurants in Patia with offers', 'chinese', null, null, 'Patia', 'chinese restaurants in Patia'],
    ['restaurants in Patia', null, null, null, 'Patia', 'restaurants in Patia'],
    ['restaurants near me', null, null, null, null, 'restaurants'],
  ])('parses natural-language intent for %s', (query, cuisine, people, budget, location, providerQuery) => {
    const intent = parseDemoSearchIntent(query);
    expect(intent).toMatchObject({
      cuisine,
      people,
      budget,
      location,
    });
    expect(getCatalogueSearchText(query, intent)).toBe(providerQuery);
  });

  it.each([
    'restaurants in Patia',
    'restaurants in Kalinga Nagar',
    'restaurants near me',
  ])('does not infer a cuisine from the filler words in %s', (query) => {
    expect(parseDemoSearchIntent(query).cuisine).toBeNull();
  });

  it('matches localities regardless of spacing', () => {
    const catalogue = [{
      canonicalRestaurantId: 'google:1', name: 'Kalinga Flavours', location: 'Kalinganagar', cuisines: [],
    }];
    expect(searchDemoRestaurants('restaurants in Kalinga Nagar', '', catalogue)).toHaveLength(1);
  });

  it('filters catalogue restaurants by known cuisine but keeps unknown-cuisine ones', () => {
    const catalogue = [
      { canonicalRestaurantId: 'google:1', name: 'Wok Place', cuisines: ['Chinese'] },
      { canonicalRestaurantId: 'google:2', name: 'Pasta Place', cuisines: ['Italian'] },
      { canonicalRestaurantId: 'google:3', name: 'Mystery Kitchen', cuisines: [] },
    ];
    expect(searchDemoRestaurants('chinese', '', catalogue).map(({ name }) => name))
      .toEqual(expect.arrayContaining(['Wok Place', 'Mystery Kitchen']));
    expect(searchDemoRestaurants('chinese', '', catalogue).map(({ name }) => name))
      .not.toContain('Pasta Place');
  });

  it('uses Swiggy cuisine/category fields to exclude known incompatible results', () => {
    const catalogue = [
      { id: '1', name: 'Wok Place', cuisine: 'Chinese' },
      { id: '2', name: 'Sweet Place', category: 'Sweets' },
      { id: '3', name: 'Mystery Kitchen' },
    ];
    expect(searchDemoRestaurants('chinese', '', catalogue).map(({ id }) => id))
      .toEqual(expect.arrayContaining(['1', '3']));
    expect(searchDemoRestaurants('chinese', '', catalogue).map(({ id }) => id))
      .not.toContain('2');
  });

  it('parses a pure-vegetarian cafe query and returns Basil through its structured attributes', () => {
    const intent = parseDemoSearchIntent('pure veg cafe');
    const result = searchDemoRestaurants('pure veg cafe');
    const basil = demoRestaurants.find((restaurant) => restaurant.name === 'The Basil Cafe & Restro');

    expect(intent).toMatchObject({ dietary: 'pureVeg', category: 'cafe' });
    expect(basil.dietary).toMatchObject({ pureVeg: true, vegetarianFriendly: true });
    expect(result.map(({ name }) => name)).toEqual(['The Basil Cafe & Restro']);
  });

  it('offers category, nearby, budget, and name suggestions as the user types', () => {
    const labels = getDemoSuggestions('chi').map(({ label }) => label);
    expect(labels).toContain('Chinese restaurants');
    expect(labels).toContain('Chinese restaurants near you');
    expect(labels).toContain('Chinese restaurants under ₹3000');

    expect(getDemoSuggestions('bas').map(({ label }) => label))
      .toContain('The Basil Cafe & Restro');
    expect(getDemoSuggestions('bar').map(({ label }) => label))
      .toEqual(expect.arrayContaining([
        'Baron & Baroness – Mayfair Lagoon',
        'Barbeque Nation – Triplex Mall',
      ]));
  });

  it('filters by explicitly requested offers but keeps no-offer restaurants otherwise', () => {
    const barbeque = demoRestaurants.find(({ name }) => name.startsWith('Barbeque Nation'));
    const terraRosso = demoRestaurants.find(({ name }) => name === 'Terra Rosso');
    expect(searchDemoRestaurants('restaurant').map(({ name }) => name)).toContain(barbeque.name);
    expect(getDemoBestOffer(barbeque)).toMatchObject({ provider: 'district', discountPercent: 10 });
    expect(searchDemoRestaurants('barbeque nation with offers').map(({ name }) => name))
      .toContain(barbeque.name);
    expect(searchDemoRestaurants('barbeque nation without offers')).toEqual([]);
    expect(searchDemoRestaurants('terra rosso with offers')).toEqual([]);
    expect(searchDemoRestaurants('terra rosso without offers').map(({ name }) => name))
      .toContain(terraRosso.name);
  });

  it('preserves unknown budget values without inventing an estimate or excluding restaurants', () => {
    const results = searchDemoRestaurants('restaurants under ₹3000 for 5 people');
    expect(results).toHaveLength(demoRestaurants.length);
    expect(results.every(({ budgetMatch, budgetEstimate }) => (
      budgetMatch === 'unknown' && budgetEstimate === null
    ))).toBe(true);
  });

  it('only estimates party spend from a supplied cost-for-two value and labels it as an estimate', () => {
    const restaurant = {
      ...demoRestaurants[0],
      costForTwo: '₹1,000 for two',
    };
    const [result] = searchDemoRestaurants('basil for 5 people', '', [restaurant]);
    expect(result.budgetEstimate).toBe(2500);
    expect(result.budgetEstimateLabel).toBe('Estimated for party size');
  });

  it('uses only the live Swiggy candidates passed to the search helper', () => {
    const liveRestaurant = {
      id: 'swiggy:1',
      canonicalRestaurantId: 'swiggy:1',
      name: 'The Basil Cafe & Restro',
      location: 'Kalinga Nagar',
      cuisines: [],
      dietary: { pureVeg: true },
      offers: [],
      offerDataKnown: true,
    };
    expect(searchDemoRestaurants('basil', '', [liveRestaurant]).map(({ id }) => id))
      .toEqual(['swiggy:1']);
  });

  it('keeps restaurants with unknown offer status for offer-intent queries', () => {
    const liveRestaurant = {
      canonicalRestaurantId: 'swiggy:unknown',
      name: 'Wok Place',
      cuisines: ['Chinese'],
      offerDataKnown: false,
    };
    expect(searchDemoRestaurants('chinese with offers', '', [liveRestaurant]))
      .toHaveLength(1);
  });

  it('normalizes user-supplied offers into the shared comparison shape and preserves exact URLs', () => {
    const basil = demoRestaurants.find(({ name }) => name === 'The Basil Cafe & Restro');
    const offers = demoOfferList(basil);
    expect(offers).toHaveLength(4);
    expect(offers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        provider: 'swiggy',
        offerType: 'table-booking',
        discount: 20,
        originalPrice: null,
        finalPrice: null,
        isVerified: true,
        deepLink: 'https://www.swiggy.com/restaurants/bhubaneswar/kalinga-nagar/the-basil-cafe-and-restro-1101007/dineout',
      }),
      expect.objectContaining({
        provider: 'district',
        offerType: 'table-booking',
        discount: 20,
        deepLink: 'https://www.district.in/dining/bhubaneswar/the-basil-cafe-restro-kalinga-nagar-bhubaneshwar',
      }),
      expect.objectContaining({
        provider: 'eazydiner',
        offerType: 'BOOK_AND_PAY',
        discount: 10,
        deepLink: 'https://www.eazydiner.com/bhubaneswar/the-basil-cafe-restro-kalinga-nagar-bhubaneswar-706561',
      }),
    ]));
    expect(offers.some(({ title }) => /cashback|bank|card|wallet/i.test(title))).toBe(false);
  });

  it('includes only the supplied Basil menu categories with no fabricated items or prices', () => {
    const basil = demoRestaurants.find(({ name }) => name === 'The Basil Cafe & Restro');
    expect(basil.menu.categories.map(({ name }) => name)).toEqual([
      'Special Menu',
      'Platter',
      'Soups & Salads',
      'Starters',
      'Main Course',
      'Fried Rice & Noodles',
      'Pizza & Pasta',
      'Burgers & Sandwiches',
      'Snacks',
      'Wraps',
      'Sushi',
      'Accompaniments',
      'Beverages',
    ]);
    expect(basil.menu.categories.every(({ items }) => items.length === 0)).toBe(true);
  });
});
