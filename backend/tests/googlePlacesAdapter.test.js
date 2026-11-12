import { describe, expect, it, vi } from 'vitest';
import { createGooglePlacesAdapter } from '../src/adapters/googlePlacesAdapter.js';

const samplePlace = {
  id: 'place-123',
  displayName: { text: 'Tulya Test Bistro' },
  formattedAddress: '1 Test Street, Bengaluru',
  location: { latitude: 12.9352, longitude: 77.6245 },
  rating: 4.6,
  userRatingCount: 125,
  primaryTypeDisplayName: { text: 'Indian restaurant' },
  photos: [{
    name: 'places/place-123/photos/photo-456',
    authorAttributions: [{ displayName: 'Photographer', uri: 'https://example.test/author' }],
  }],
};

describe('Google Places adapter', () => {
  it('searches a radius up to 60 km using server-side credentials and normalizes restaurant results', async () => {
    const fetchImpl = vi.fn().mockImplementation(() => (
      Promise.resolve(new Response(JSON.stringify({ places: [samplePlace] })))
    ));
    const adapter = createGooglePlacesAdapter({ apiKey: 'server-secret-key', fetchImpl });
    const results = await adapter.searchNearby({
      latitude: 12.9352,
      longitude: 77.6245,
      distance: 60,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(fetchImpl.mock.calls[0][1].headers['X-Goog-Api-Key']).toBe('server-secret-key');
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: 'google-place-place-123',
      name: 'Tulya Test Bistro',
      source: 'restaurant_catalog',
      offers: [],
    });
    expect(results[0].image).toBe(
      '/api/v1/restaurants/photos?name=places%2Fplace-123%2Fphotos%2Fphoto-456',
    );
    expect(results[0].photoAttributions[0].displayName).toBe('Photographer');
  });

  it('does not call the provider or fabricate results when no server key is configured', async () => {
    const fetchImpl = vi.fn();
    const adapter = createGooglePlacesAdapter({ apiKey: '', fetchImpl });

    await expect(adapter.searchNearby({
      latitude: 12.9352,
      longitude: 77.6245,
      distance: 20,
    })).rejects.toMatchObject({ statusCode: 503 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns no places for a zero-kilometer search without calling the provider', async () => {
    const fetchImpl = vi.fn();
    const adapter = createGooglePlacesAdapter({ apiKey: 'server-secret-key', fetchImpl });

    await expect(adapter.searchNearby({
      latitude: 12.9352,
      longitude: 77.6245,
      distance: 0,
    })).resolves.toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('expands a saturated nearby search and deduplicates results from overlapping radius tiles', async () => {
    const firstPage = Array.from({ length: 20 }, (_, index) => ({
      ...samplePlace,
      id: `place-${index}`,
    }));
    const additionalPlace = { ...samplePlace, id: 'place-outside-first-page' };
    const fetchImpl = vi.fn((_, options) => {
      const callNumber = fetchImpl.mock.calls.length;
      const places = callNumber === 1 ? firstPage : [...firstPage, additionalPlace];
      return Promise.resolve(new Response(JSON.stringify({ places }), options));
    });
    const adapter = createGooglePlacesAdapter({ apiKey: 'server-secret-key', fetchImpl });

    const results = await adapter.searchNearby({
      latitude: 12.9352,
      longitude: 77.6245,
      distance: 5,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(5);
    expect(results).toHaveLength(21);
    expect(new Set(results.map((place) => place.id)).size).toBe(21);
  });

  it('proxies validated provider photo data without returning the API key', async () => {
    const photo = Buffer.from('image-content');
    const fetchImpl = vi.fn().mockResolvedValue(new Response(photo, {
      headers: { 'Content-Type': 'image/jpeg' },
    }));
    const adapter = createGooglePlacesAdapter({ apiKey: 'server-secret-key', fetchImpl });
    const result = await adapter.fetchPhoto('places/place-123/photos/photo-456');

    expect(result.contentType).toBe('image/jpeg');
    expect(result.body).toEqual(photo);
    expect(fetchImpl.mock.calls[0][1].headers['X-Goog-Api-Key']).toBe('server-secret-key');
  });

  it('uses a location-biased text search and reverse-geocodes without exposing coordinates in its result', async () => {
    const geocodeResult = {
      status: 'OK',
      results: [{
        address_components: [{
          long_name: 'Patia',
          types: ['sublocality_level_1'],
        }],
      }],
    };
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(geocodeResult)))
      .mockResolvedValueOnce(new Response(JSON.stringify({ places: [samplePlace] })));
    const adapter = createGooglePlacesAdapter({ apiKey: 'server-secret-key', fetchImpl });

    const result = await adapter.searchRestaurants({
      query: 'north indian restaurants',
      latitude: 12.9352,
      longitude: 77.6245,
      distance: 20,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1][0]).toBe('https://places.googleapis.com/v1/places:searchText');
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body).textQuery)
      .toBe('north indian restaurants in Patia, Bhubaneswar, Odisha');
    expect(result.area).toBe('Patia');
    expect(result.restaurants[0]).toMatchObject({
      canonicalRestaurantId: 'google:place-123',
      name: samplePlace.displayName.text,
      cuisine: 'Indian restaurant',
      address: samplePlace.formattedAddress,
    });
    expect(JSON.stringify(result)).not.toContain('12.9352');
    expect(JSON.stringify(result)).not.toContain('77.6245');
  });

  it('uses live text search for a selected locality without requiring geocoding and supports place details', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        places: [samplePlace],
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify(samplePlace)));
    const adapter = createGooglePlacesAdapter({ apiKey: 'server-secret-key', fetchImpl });

    const search = await adapter.searchRestaurants({ location: 'Patia', distance: 20 });
    const details = await adapter.getPlaceDetails('place-123');

    expect(search.area).toBe('Patia');
    expect(fetchImpl.mock.calls[0][0]).toBe('https://places.googleapis.com/v1/places:searchText');
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).textQuery)
      .toBe('restaurants in Patia, Bhubaneswar, Odisha');
    expect(search.restaurants).toHaveLength(1);
    expect(search.restaurants[0].distance).toBeNull();
    expect(details).toMatchObject({
      canonicalRestaurantId: 'google:place-123',
      address: samplePlace.formattedAddress,
      image: '/api/v1/restaurants/photos?name=places%2Fplace-123%2Fphotos%2Fphoto-456',
    });
  });

  it('matches restaurant photos by name and locality, selecting the correct same-name place', async () => {
    const basilInAnotherArea = {
      ...samplePlace,
      id: 'basil-patia',
      displayName: { text: 'The Basil Cafe & Restro' },
      formattedAddress: 'Patia, Bhubaneswar, Odisha, India',
    };
    const basilInKalingaNagar = {
      ...samplePlace,
      id: 'basil-kalinga-nagar',
      displayName: { text: 'Basil Cafe and Restro' },
      formattedAddress: 'Kalinga Nagar, Bhubaneswar, Odisha, India',
      photos: [{ name: 'places/basil-kalinga-nagar/photos/verified-photo', authorAttributions: [] }],
    };
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      places: [basilInAnotherArea, basilInKalingaNagar],
    })));
    const adapter = createGooglePlacesAdapter({ apiKey: 'server-secret-key', fetchImpl });

    const result = await adapter.findRestaurantPhoto({
      name: 'The Basil Cafe & Restro',
      location: 'Kalinga Nagar',
      address: 'Kalinga Nagar, Bhubaneswar, Odisha',
    });

    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).textQuery)
      .toContain('The Basil Cafe & Restro restaurant in Kalinga Nagar');
    expect(result).toEqual({
      image: '/api/v1/restaurants/photos?name=places%2Fbasil-kalinga-nagar%2Fphotos%2Fverified-photo',
      placeId: 'basil-kalinga-nagar',
      photoAttributions: [],
    });
  });

  it('prioritizes the supplied Google Place ID over a text-name lookup', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ...samplePlace,
      id: 'mapped-google-place',
    })));
    const adapter = createGooglePlacesAdapter({ apiKey: 'server-secret-key', fetchImpl });

    const result = await adapter.findRestaurantPhoto({
      name: 'Name that does not match',
      location: 'Different locality',
      googlePlaceId: 'mapped-google-place',
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toContain('/places/mapped-google-place');
    expect(result).toMatchObject({
      placeId: 'mapped-google-place',
      image: '/api/v1/restaurants/photos?name=places%2Fplace-123%2Fphotos%2Fphoto-456',
    });
  });

  it('works when findRestaurantPhoto is called detached from the adapter (as the controller does)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify(samplePlace)));
    const { findRestaurantPhoto } = createGooglePlacesAdapter({ apiKey: 'server-secret-key', fetchImpl });

    await expect(findRestaurantPhoto({ name: 'x', googlePlaceId: 'place-123' }))
      .resolves.toMatchObject({ placeId: 'place-123' });
  });

  it('returns a null image when the matched place has no photo', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      places: [{ ...samplePlace, displayName: { text: 'The Pagoda' }, formattedAddress: 'Bhubaneswar', photos: [] }],
    })));
    const adapter = createGooglePlacesAdapter({ apiKey: 'server-secret-key', fetchImpl });

    await expect(adapter.findRestaurantPhoto({ name: 'The Pagoda', location: 'Bhubaneswar' }))
      .resolves.toEqual({ image: null, placeId: null, photoAttributions: [] });
  });

  it('rejects photo matching with 503 when Google Places is not configured', async () => {
    const fetchImpl = vi.fn();
    const adapter = createGooglePlacesAdapter({ apiKey: '', fetchImpl });

    await expect(adapter.findRestaurantPhoto({ name: 'The Pagoda' }))
      .rejects.toMatchObject({ statusCode: 503 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('does not match a same-name restaurant outside the requested locality', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      places: [{
        ...samplePlace,
        displayName: { text: 'The Pagoda' },
        formattedAddress: 'Patia, Bhubaneswar, Odisha, India',
      }],
    })));
    const adapter = createGooglePlacesAdapter({ apiKey: 'server-secret-key', fetchImpl });

    await expect(adapter.findRestaurantPhoto({
      name: 'The Pagoda',
      location: 'Nayapalli',
    })).resolves.toMatchObject({ image: null, placeId: null });
  });

  it('uses live text search for the default Bhubaneswar homepage when coordinates are unavailable', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      places: [samplePlace],
    })));
    const adapter = createGooglePlacesAdapter({ apiKey: 'server-secret-key', fetchImpl });

    const result = await adapter.searchRestaurants({});

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://places.googleapis.com/v1/places:searchText');
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).textQuery)
      .toBe('restaurants in Bhubaneswar, Odisha');
    expect(result.restaurants).toHaveLength(1);
  });

  it('falls back to live city search when reverse geocoding is denied', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'REQUEST_DENIED' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ places: [samplePlace] })));
    const adapter = createGooglePlacesAdapter({ apiKey: 'server-secret-key', fetchImpl });

    const result = await adapter.searchRestaurants({
      latitude: 20.2961,
      longitude: 85.8245,
      distance: 20,
    });

    expect(result.area).toBe('Bhubaneswar');
    expect(result.locationFallback).toBe(true);
    expect(fetchImpl.mock.calls[1][0]).toBe('https://places.googleapis.com/v1/places:searchText');
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual({
      textQuery: 'restaurants in Bhubaneswar, Odisha',
      pageSize: 20,
    });
    expect(result.restaurants).toHaveLength(1);
    expect(result.restaurants[0].distance).toBeNull();
  });
});
