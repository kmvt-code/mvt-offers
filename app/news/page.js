import { supabasePublic } from '../../lib/supabase';
import { formatDate } from '../../lib/dates';

export const revalidate = 60;

export const metadata = { title: 'Supplier News | MVT Offer Library' };

// Supplier updates that are not offers: openings, renovations, leadership
// changes, itinerary news, webinars and events. Filled automatically by the
// ingest pipeline. Row level security shows only published, unexpired items.
export default async function NewsPage() {
  const { data: updates } = await supabasePublic
    .from('supplier_updates')
    .select('id, created_at, vendor, supplier_type, category, headline, summary, details, link, event_date, contact')
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(200);

  const items = updates || [];

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
          <nav className="site-nav">
            <a href="/">Offers</a>
            <a href="/news" className="active">Supplier News</a>
          </nav>
        </div>
      </header>

      <main className="main">
        <div className="container">
          <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, color: 'var(--navy)', margin: '8px 0 6px' }}>Supplier News</h1>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 22px' }}>
            Openings, renovations, new itineraries and events from our partners. Items stay here for 90 days.
          </p>
          {items.length === 0 && <div className="empty">No supplier news right now.</div>}
          <div className="news-list">
            {items.map(u => (
              <article key={u.id} className="news-item">
                <div className="news-meta">
                  <span>{u.category || 'General'}</span>
                  {u.supplier_type && <><span>·</span><span>{u.supplier_type}</span></>}
                  <span>·</span><span>{formatDate(String(u.created_at).slice(0, 10))}</span>
                  {u.event_date && <><span>·</span><span>Date: {formatDate(u.event_date)}</span></>}
                </div>
                <h3>{u.vendor ? `${u.vendor}: ` : ''}{u.headline}</h3>
                <p>{u.summary}</p>
                {u.link && /^https?:\/\//i.test(u.link) && (
                  <a className="news-link" href={u.link} target="_blank" rel="noopener noreferrer">More from the supplier</a>
                )}
                {u.contact && <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>Contact: {u.contact}</p>}
              </article>
            ))}
          </div>
        </div>
      </main>

      <footer className="footer">
        <div className="container">MVT Offer Library · Internal use only</div>
      </footer>
    </>
  );
}
