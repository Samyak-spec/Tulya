import { Link, Route, Routes } from 'react-router-dom';
import DemoRestaurantDetailPage from './pages/DemoRestaurantDetailPage';
import HomePage from './pages/HomePage';
import RestaurantsPage from './pages/RestaurantsPage';
import Layout from './components/Layout';

function NotFoundPage() {
  return (
    <Layout>
      <section className="page-shell">
        <p className="eyebrow">Page not found</p>
        <h1 className="mt-3 text-3xl font-semibold text-white">This Tulya page does not exist.</h1>
        <Link className="mt-5 inline-flex text-lavender underline" to="/">Return to restaurant discovery</Link>
      </section>
    </Layout>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/restaurants" element={<RestaurantsPage />} />
      <Route
        path="/restaurants/:id"
        element={<DemoRestaurantDetailPage />}
      />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default App;
