import { Home, MapPin, Search } from 'lucide-react';
import { Link, NavLink } from 'react-router-dom';

const navigation = [
  { label: 'Home', to: '/', icon: Home },
  { label: 'Restaurants', to: '/restaurants', icon: Search },
];

function Layout({ children }) {
  return (
    <div className="min-h-screen text-slate-200">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/75 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-3" aria-label="Tulya homepage">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-lavender/40 bg-white/5 font-serif text-lg text-lavender">
              t.
            </div>
            <div>
              <div className="text-lg font-semibold tracking-wide text-white">Tulya</div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">A better table, for less</div>
            </div>
          </Link>

          <nav className="hidden items-center gap-2 md:flex">
            {navigation.map(({ label, to, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm transition ${
                    isActive ? 'bg-white/10 text-lavender ring-1 ring-lavender/30' : 'text-slate-300 hover:bg-white/5'
                  }`
                }
              >
                <Icon size={16} />
                {label}
              </NavLink>
            ))}
          </nav>

          <span
            className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-300 transition sm:inline-flex"
          >
            <MapPin size={14} />
            Nearby, thoughtfully
          </span>
        </div>
      </header>

      <main>{children}</main>
    </div>
  );
}

export default Layout;
