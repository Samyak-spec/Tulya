function FilterSidebar() {
  return (
    <aside className="glass-panel p-5">
      <div className="mb-5 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Filters</h3>
        <button type="button" className="text-sm text-orange-300 hover:text-orange-200">
          Reset
        </button>
      </div>

      <div className="space-y-5">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-300">Budget</label>
          <select className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-slate-200 outline-none focus:border-orange-400">
            <option>Under ₹500</option>
            <option>₹500 - ₹1,000</option>
            <option>₹1,000 - ₹2,000</option>
            <option>₹2,000+</option>
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-300">Cuisine</label>
          <div className="flex flex-wrap gap-2">
            {['Indian', 'Pizza', 'Chinese', 'Healthy'].map((item) => (
              <button
                key={item}
                type="button"
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200 transition hover:border-orange-400/60 hover:text-orange-200"
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-300">Rating</label>
          <div className="space-y-2 text-sm text-slate-300">
            {['4.0+', '4.5+', '4.8+'].map((item) => (
              <label key={item} className="flex items-center gap-2">
                <input type="radio" name="rating" className="accent-orange-500" />
                {item}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-300">Distance</label>
          <input type="range" min="0" max="10" defaultValue="3" className="w-full accent-orange-500" />
        </div>
      </div>
    </aside>
  );
}

export default FilterSidebar;
