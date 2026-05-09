import { supabasePublic } from '../lib/supabase';
import OfferList from '../components/OfferList';

export const revalidate = 60;

export default async function HomePage() {
  const { data: offers } = await supabasePublic
    .from('offers')
    .select('id, vendor, supplier_type, audience, offer_overview, offer_start_date, offer_end_date, travel_start_window, travel_end_window, attachment_urls')
    .eq('status', 'published')
    .order('created_at', { ascending: false });

  return (
    <>
      <header className="site-header">
        <div className="container site-header-inner">
          <a href="/" className="site-brand">
            <div className="site-brand-mark">M</div>
            <div>
              <div className="site-brand-title">Offer Library</div>
              <div className="site-brand-sub">Montecito Village Travel</div>
            </div>
          </a>
        </div>
      </header>

      <main className="main">
        <div className="container">
          <OfferList offers={offers || []} />
        </div>
      </main>

      <footer className="footer">
        <div className="container">
          MVT Offer Library · Internal use only · Updated automatically from offers@
        </div>
      </footer>
    </>
  );
}
