import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RestaurantDiscovery from './RestaurantDiscovery';
import { compareOffers } from '../services/manualEnrichment';
import { createSyntheticFallbackOffers } from '../services/syntheticOffers';

const mocks = vi.hoisted(() => ({
  compareRestaurantOffers: vi.fn(),
  getBrowserLocation: vi.fn(),
  getSwiggyAddresses: vi.fn(),
  getSwiggySession: vi.fn(),
  searchSwiggyRestaurants: vi.fn(),
}));

vi.mock('../services/api', () => ({
  compareRestaurantOffers: mocks.compareRestaurantOffers,
  getSwiggyAddresses: mocks.getSwiggyAddresses,
  getSwiggySession: mocks.getSwiggySession,
  searchSwiggyRestaurants: mocks.searchSwiggyRestaurants,
  selectSwiggyAddress: vi.fn(),
}));

vi.mock('../utils/browserLocation', () => ({
  getBrowserLocation: mocks.getBrowserLocation,
}));

const renderDiscovery = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RestaurantDiscovery showResultsHeading />
    </QueryClientProvider>,
  );
};

describe('Swiggy restaurant discovery', () => {
  beforeEach(() => {
    mocks.compareRestaurantOffers.mockResolvedValue({
      data: { results: [{ offers: [], providerStatuses: [] }] },
    });
    mocks.getBrowserLocation.mockRejectedValue(new Error('Geolocation denied'));
    mocks.getSwiggyAddresses.mockResolvedValue([{ id: 'saved-location', selected: true }]);
    mocks.getSwiggySession.mockResolvedValue({ connected: true });
    mocks.searchSwiggyRestaurants.mockResolvedValue({
      restaurants: [{
        id: '1101007',
        name: 'The Basil Cafe & Restro',
        areaName: 'Kalinga Nagar',
        avgRating: 4.6,
        costForTwo: '₹1,000 for two',
      }],
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows suggestions before submit and selects a live Swiggy result with its exact provider links', async () => {
    const user = userEvent.setup();
    renderDiscovery();
    const input = screen.getByRole('searchbox', { name: 'Find restaurants' });

    await user.type(input, 'chi');
    expect(screen.getAllByRole('option', { name: /Chinese restaurants/ })[0]).toBeVisible();

    await user.clear(input);
    await user.type(input, 'basi');
    const basilSuggestion = screen.getByRole('option', { name: /The Basil Cafe & Restro/ });
    expect(basilSuggestion).toBeVisible();
    await user.click(basilSuggestion);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'The Basil Cafe & Restro' })).toBeVisible();
    });
    expect(screen.getByText('4.6 Tulya rating')).toBeVisible();
    expect(screen.getByText('4.6 District rating')).toBeVisible();
    expect(screen.getByText('4.6 EazyDiner rating')).toBeVisible();
    expect(mocks.searchSwiggyRestaurants).not.toHaveBeenCalled();
    expect(mocks.getBrowserLocation).not.toHaveBeenCalled();
    const districtLink = screen.getByRole('link', { name: /View on District/ });
    expect(districtLink).toHaveAttribute(
      'href',
      'https://www.district.in/dining/bhubaneswar/the-basil-cafe-restro-kalinga-nagar-bhubaneshwar',
    );
    const swiggyLink = screen.getByRole('link', { name: /View on Swiggy/ });
    expect(swiggyLink).toHaveAttribute(
      'href',
      'https://www.swiggy.com/restaurants/bhubaneswar/kalinga-nagar/the-basil-cafe-and-restro-1101007/dineout',
    );
    expect(swiggyLink).toHaveAttribute('target', '_blank');
    const eazydinerLink = screen.getByRole('link', { name: /View on EazyDiner/ });
    expect(eazydinerLink).toHaveAttribute(
      'href',
      'https://www.eazydiner.com/bhubaneswar/the-basil-cafe-restro-kalinga-nagar-bhubaneswar-706561',
    );
    expect(eazydinerLink).toHaveAttribute('target', '_blank');
  });

  it('keeps a linked provider visible with No current offer when that provider has no primary offer', async () => {
    const user = userEvent.setup();
    renderDiscovery();
    await user.type(screen.getByRole('searchbox', { name: 'Find restaurants' }), 'birch');
    await user.click(screen.getByRole('button', { name: 'Find restaurants' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Birch' })).toBeVisible();
    });
    expect(mocks.searchSwiggyRestaurants).not.toHaveBeenCalled();
    const swiggyNoOfferLink = screen.getByRole('link', { name: /View on Swiggy/ });
    expect(swiggyNoOfferLink.parentElement).toHaveTextContent('Swiggy: No current offer');
    expect(swiggyNoOfferLink).toHaveAttribute(
      'href',
      'https://www.swiggy.com/restaurants/bhubaneswar/patia/birch-1066741/dineout',
    );
    expect(screen.getAllByText(/District/).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /View on EazyDiner/ })).toHaveAttribute(
      'href',
      'https://www.eazydiner.com/bhubaneswar/birch-patia-bhubaneshwar-705216',
    );
  });

  it('renders at most one best offer card for each of the three providers', async () => {
    const user = userEvent.setup();
    renderDiscovery();
    await user.type(
      screen.getByRole('searchbox', { name: 'Find restaurants' }),
      'Baron & Baroness Mayfair Lagoon',
    );
    await user.click(screen.getByRole('button', { name: 'Find restaurants' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Baron & Baroness – Mayfair Lagoon' })).toBeVisible();
    });

    expect(screen.getAllByRole('article')).toHaveLength(3);
    expect(screen.getAllByRole('link', { name: /View on Swiggy/ })).toHaveLength(1);
    expect(screen.getAllByRole('link', { name: /View on District/ })).toHaveLength(1);
    expect(screen.getAllByRole('link', { name: /View on EazyDiner/ })).toHaveLength(1);
    expect(screen.getAllByRole('article').map((card) => card.textContent)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Swiggy'),
        expect.stringContaining('District'),
        expect.stringContaining('EazyDiner'),
      ]),
    );
  });

  it.each([
    ['The Restaurant – Trident Bhubaneswar', 'The Restaurant – Trident Bhubaneswar', 'https://www.swiggy.com/restaurants/bhubaneswar/nayapalli/the-restaurant-trident-bhubaneswar-1084888/dineout'],
    ['Nakli Dhaba – Mayfair Lagoon', 'Nakli Dhaba – Mayfair Lagoon', 'https://www.eazydiner.com/bhubaneswar/nakli-dhaba-mayfair-lagoon-bhubaneswar-695870'],
    ['Tea Pot – Mayfair Lagoon', 'Tea Pot – Mayfair Lagoon', 'https://www.eazydiner.com/bhubaneswar/tea-pot-mayfair-lagoon-bhubaneswar-695869'],
    ['Lyfe Kitchen – Lyfe Hotel', 'Lyfe Kitchen – Lyfe Hotel', 'https://www.swiggy.com/restaurants/lyfe-kitchen-lyfe-hotel-bapuji-nagar-bhubaneswar-915115/dineout'],
    ['Barbeque Nation – Triplex Mall', 'Barbeque Nation – Triplex Mall', 'https://www.district.in/dining/bhubaneswar/barbeque-nation-chandrasekharpur-bhubaneshwar'],
    ['The Basil Cafe & Restro', 'The Basil Cafe & Restro', 'https://www.swiggy.com/restaurants/bhubaneswar/kalinga-nagar/the-basil-cafe-and-restro-1101007/dineout'],
    ['Blanco Kitchen & Terrace', 'Blanco Kitchen & Terrace', 'https://www.district.in/dining/bhubaneswar/blanco-sahid-nagar-bhubaneshwar'],
    ['Terra Rosso', 'Terra Rosso', null],
    ['Baron & Baroness – Mayfair Lagoon', 'Baron & Baroness – Mayfair Lagoon', 'https://www.swiggy.com/restaurants/bhubaneswar/jayadev-vihar/baron-baroness-mayfair-lagoon-927189/dineout'],
    ['Birch', 'Birch', 'https://www.district.in/dining/bhubaneswar/birch-patia-bhubaneshwar'],
  ])('resolves %s directly to its canonical restaurant and best linked offer', async (query, name, bestUrl) => {
    const user = userEvent.setup();
    mocks.searchSwiggyRestaurants.mockResolvedValue({ restaurants: [] });
    renderDiscovery();
    await user.type(screen.getByRole('searchbox', { name: 'Find restaurants' }), query);
    await user.click(screen.getByRole('button', { name: 'Find restaurants' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name })).toBeVisible();
    });
    expect(mocks.searchSwiggyRestaurants).not.toHaveBeenCalled();
    expect(mocks.getSwiggySession).not.toHaveBeenCalled();
    if (bestUrl) {
      expect(screen.getByRole('link', { name: /Best offer/ })).toHaveAttribute('href', bestUrl);
    } else {
      expect(screen.queryByRole('link', { name: /Best offer/ })).not.toBeInTheDocument();
    }
    expect(screen.queryByText('See provider')).not.toBeInTheDocument();
  });

  it('links every provider card and the Best offer button to exact provider URLs', async () => {
    const user = userEvent.setup();
    renderDiscovery();
    await user.type(screen.getByRole('searchbox', { name: 'Find restaurants' }), 'The Basil Cafe & Restro');
    await user.click(screen.getByRole('button', { name: 'Find restaurants' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'The Basil Cafe & Restro' })).toBeVisible();
    });

    expect(screen.getAllByRole('article')).toHaveLength(3);
    const swiggyUrl = 'https://www.swiggy.com/restaurants/bhubaneswar/kalinga-nagar/the-basil-cafe-and-restro-1101007/dineout';
    expect(screen.getByRole('link', { name: /View on Swiggy/ })).toHaveAttribute('href', swiggyUrl);
    expect(screen.getByRole('link', { name: /View on District/ })).toHaveAttribute(
      'href',
      'https://www.district.in/dining/bhubaneswar/the-basil-cafe-restro-kalinga-nagar-bhubaneshwar',
    );
    expect(screen.getByRole('link', { name: /View on EazyDiner/ })).toHaveAttribute(
      'href',
      'https://www.eazydiner.com/bhubaneswar/the-basil-cafe-restro-kalinga-nagar-bhubaneswar-706561',
    );
    expect(screen.getByRole('link', { name: /Best offer/ })).toHaveAttribute('href', swiggyUrl);
  });

  it('marks exactly one synthetic-only card as Best deal and hides Best offer without a URL', async () => {
    const user = userEvent.setup();
    mocks.searchSwiggyRestaurants.mockResolvedValue({
      restaurants: [{ id: '777', name: "Richie's Fastfood & Restaurant", areaName: 'Patia', avgRating: 4.1 }],
    });
    renderDiscovery();
    await user.type(screen.getByRole('searchbox', { name: 'Find restaurants' }), 'Richies Fastfood');
    await user.click(screen.getByRole('button', { name: 'Find restaurants' }));
    await waitFor(() => {
      expect(screen.getAllByRole('article')).toHaveLength(3);
    });

    const restaurant = { id: 'swiggy:777', name: "Richie's Fastfood & Restaurant" };
    const winner = [...createSyntheticFallbackOffers(restaurant, [])].sort(compareOffers)[0];
    expect(screen.getAllByText('Best deal')).toHaveLength(1);
    const bestCard = screen.getAllByRole('article').find((card) => card.textContent.includes('Best deal'));
    expect(bestCard).toHaveTextContent(`${winner.discountPercent}% OFF — ${winner.provider}`);
    expect(screen.queryByRole('link', { name: /Best offer/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Best offer/ })).toBeDisabled();
    ['Swiggy', 'District', 'EazyDiner'].forEach((name) => {
      expect(screen.getByRole('button', { name: new RegExp(`View on ${name}`) })).toBeDisabled();
    });
  });

  it('points the Best offer button and card at the winning synthetic provider URL', async () => {
    const user = userEvent.setup();
    const restaurant = { id: 'swiggy:778', name: 'Quiet Corner Grill' };
    const synthetic = createSyntheticFallbackOffers(restaurant, []);
    const winner = [...synthetic].sort(compareOffers)[0];
    const urls = {
      swiggy: 'https://www.swiggy.com/exact-778',
      district: 'https://www.district.in/exact-778',
      eazydiner: 'https://www.eazydiner.com/exact-778',
    };
    mocks.searchSwiggyRestaurants.mockResolvedValue({
      restaurants: [{ id: '778', name: 'Quiet Corner Grill', areaName: 'Patia' }],
    });
    mocks.compareRestaurantOffers.mockResolvedValue({
      data: {
        results: [{
          providerStatuses: [],
          offers: Object.entries(urls).map(([key, deepLink]) => ({
            provider: key, offerType: 'dine-in', isVerified: false, deepLink,
          })),
        }],
      },
    });
    renderDiscovery();
    await user.type(screen.getByRole('searchbox', { name: 'Find restaurants' }), 'Quiet Corner Grill');
    await user.click(screen.getByRole('button', { name: 'Find restaurants' }));
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Best offer/ })).toBeVisible();
    });

    expect(screen.getByRole('link', { name: /Best offer/ })).toHaveAttribute('href', urls[winner.providerKey]);
    expect(screen.getAllByText('Best deal')).toHaveLength(1);
    const bestCard = screen.getAllByRole('article').find((card) => card.textContent.includes('Best deal'));
    expect(bestCard).toHaveTextContent(winner.provider);
    expect(bestCard.querySelector('a.view-deal-button')).toHaveAttribute('href', urls[winner.providerKey]);
  });

  it('keeps generic cuisine searches on live Swiggy discovery', async () => {
    const user = userEvent.setup();
    mocks.searchSwiggyRestaurants.mockResolvedValue({
      restaurants: [{
        id: 'chinese-1',
        name: 'Chinese Garden',
        cuisines: ['Chinese'],
      }],
    });
    renderDiscovery();
    await user.type(screen.getByRole('searchbox', { name: 'Find restaurants' }), 'Chinese restaurants');
    await user.click(screen.getByRole('button', { name: 'Find restaurants' }));

    await waitFor(() => {
      expect(mocks.searchSwiggyRestaurants).toHaveBeenCalledWith('chinese restaurants', 'saved-location');
    });
    expect(await screen.findByRole('heading', { name: 'Chinese Garden' })).toBeVisible();
  });

  it('translates party-size and budget intent without presenting cost-for-two as the party price', async () => {
    const user = userEvent.setup();
    mocks.searchSwiggyRestaurants.mockResolvedValue({
      restaurants: [{
        id: 'north-indian-1',
        name: 'North Indian Kitchen',
        areaName: 'Kalinga Nagar',
        cuisines: ['North Indian'],
        costForTwo: '₹1,000 for two',
      }],
    });
    renderDiscovery();
    await user.type(
      screen.getByRole('searchbox', { name: 'Find restaurants' }),
      'north indian for 5 people under 3k',
    );
    await user.click(screen.getByRole('button', { name: 'Find restaurants' }));

    await waitFor(() => {
      expect(mocks.searchSwiggyRestaurants).toHaveBeenCalledWith(
        'north indian restaurants',
        'saved-location',
      );
    });
    expect(await screen.findByRole('heading', { name: 'North Indian Kitchen' })).toBeVisible();
    expect(screen.getByText('₹1,000 for two')).toBeVisible();
    expect(screen.getByText(/Estimated for party size: ₹2,500/)).toBeVisible();
    expect(screen.getByText(/estimated from cost for two/)).toBeVisible();
  });

  it('searches a manually selected Bhubaneswar locality using Swiggy discovery', async () => {
    const user = userEvent.setup();
    renderDiscovery();
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Filter by Bhubaneswar locality' }),
      'Patia',
    );

    await waitFor(() => {
      expect(mocks.searchSwiggyRestaurants).toHaveBeenCalledWith(
        'restaurants in Patia',
        'saved-location',
      );
    });
  });
});
