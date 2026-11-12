import { ArrowRight, MapPin, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatCurrency, getBestOffer, getOfferSavings } from '../data/mockRestaurants';
import OfferComparison from './OfferComparison';

function RestaurantCard({ restaurant }) {
  const bestOffer = getBestOffer(restaurant.offers);
  const totalSavings = getOfferSavings(bestOffer);

  return (
    <article className="glass-panel overflow-hidden transition duration-200 hover:-translate-y-1 hover:border-orange-400/40">
      <div className="relative h-52 overflow-hidden">
        <img src={restaurant.image} alt={restaurant.name} className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />
        <div className="absolute left-4 top-4 rounded-full border border-white/20 bg-slate-950/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
          {restaurant.cuisine}
        </div>
      </div>

      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold text-white">{restaurant.name}</h3>
            <div className="mt-2 flex items-center gap-2 text-sm text-slate-300">
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-1 text-amber-200">
                <Star size={14} className="fill-current" /> {restaurant.rating}
              </span>
              <span>•</span>
              <span>{restaurant.location}</span>
            </div>
          </div>
          <div className="text-right text-sm text-slate-300">
            <div className="flex items-center gap-1 justify-end">
              <MapPin size={14} />
              {restaurant.distance} km
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-orange-400/20 bg-orange-500/5 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-orange-200">Best deal</p>
              <p className="mt-1 text-2xl font-bold text-white">{formatCurrency(bestOffer.effectivePrice)}</p>
            </div>
            <div className="text-right text-sm text-slate-300">
              <p className="line-through">{formatCurrency(bestOffer.originalPrice)}</p>
              <p className="font-semibold text-emerald-300">Save {formatCurrency(totalSavings)}</p>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-slate-300">
            <span>{bestOffer.platform} is cheapest</span>
            <span className="text-orange-200">{restaurant.priceRange}</span>
          </div>
        </div>

        <OfferComparison offers={restaurant.offers} />

        <div className="mt-5 flex items-center justify-between gap-3">
          <Link
            to={`/restaurants/${restaurant.id}`}
            className="inline-flex items-center gap-2 rounded-full bg-orange-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-orange-400"
          >
            View Deal <ArrowRight size={16} />
          </Link>
          <span className="text-xs text-slate-400">{restaurant.deliveryMode}</span>
        </div>
      </div>
    </article>
  );
}

export default RestaurantCard;
