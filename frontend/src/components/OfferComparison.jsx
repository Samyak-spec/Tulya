import { Flame, Sparkles } from 'lucide-react';
import { formatCurrency, getBestOffer } from '../data/mockRestaurants';

function OfferComparison({ offers = [] }) {
  const bestOffer = getBestOffer(offers);

  return (
    <div className="mt-5 space-y-2">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
        <Flame size={14} className="text-orange-300" />
        Available on
      </div>

      {offers.map((offer) => {
        const isBest = offer.platform === bestOffer?.platform;

        return (
          <div
            key={offer.platform}
            className={`flex items-center justify-between rounded-2xl border px-3 py-2 text-sm ${
              isBest
                ? 'border-orange-400/60 bg-orange-500/10 text-orange-100'
                : 'border-white/10 bg-white/5 text-slate-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <span>{offer.platform}</span>
              {isBest ? <Sparkles size={12} className="text-orange-300" /> : null}
            </div>
            <span className={`font-semibold ${isBest ? 'text-orange-200' : 'text-white'}`}>
              {formatCurrency(offer.effectivePrice)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default OfferComparison;
