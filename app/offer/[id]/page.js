import { supabasePublic } from '../../../lib/supabase';
import { notFound } from 'next/navigation';

export const revalidate = 60;

export default async function OfferDetail({ params }) {
  const { data: offer } = await supabasePublic
    .from('offers')
    .select('*')
    .eq('id', params.id)
    .eq('status', 'published')
    .single();

  if (!offer) notFound();

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
          <div className="offer-detail">
            <a href="/" className="offer-detail-back">← Back to library</a>
            <h1>
              {offer.pinned && <span className="featured-badge">Featured</span>}
              {offer.vendor || 'Unnamed offer'}
            </h1>

            <div className="offer-detail-tags">
              {offer.supplier_type && <span className="tag tag-type">{offer.supplier_type}</span>}
              {offer.audience && <span className="tag tag-audience">{offer.audience}</span>}
              {offer.offer_end_date && <span className="tag tag-date">Through {formatDate(offer.offer_end_date)}</span>}
              {offer.tags?.map(t => <span key={t} className="tag tag-custom">#{t}</span>)}
            </div>

            {offer.offer_overview && <p className="offer-detail-overview">{offer.offer_overview}</p>}

            <div className="offer-fields">
              <Field label="Supplier Type" value={offer.supplier_type} />
              <Field label="Audience" value={offer.audience} />
              <Field label="Offer Window" value={range(offer.offer_start_date, offer.offer_end_date, formatDate)} />
              <Field label="Travel Window" value={range(offer.travel_start_window, offer.travel_end_window)} />
              <Field label="Book Through" value={offer.book_through} />
              <Field label="Voyage List" value={offer.voyage_list} link />
              <Field label="Offer Details" value={offer.offer_details} link />
              <Field label="Client Facing Content" value={offer.client_facing_content} link />
              <Field label="Contact" value={offer.contact} />
              <Field label="Full Details" value={offer.full_details} multiline />
              {offer.attachment_urls?.length > 0 && (
                <>
                  <div className="offer-field-label">Attachments</div>
                  <div className="offer-field-value">
                    {offer.attachment_urls.map((url, i) => (
                      <div key={i}><a href={url} target="_blank" rel="noopener noreferrer">📎 View attachment {i + 1}</a></div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </main>

      <footer className="footer">
        <div className="container">MVT Offer Library · Internal use only</div>
      </footer>
    </>
  );
}

function Field({ label, value, link, multiline }) {
  if (!value) return null;
  if (link && /^https?:\/\//i.test(value)) {
    return (
      <>
        <div className="offer-field-label">{label}</div>
        <div className="offer-field-value"><a href={value} target="_blank" rel="noopener noreferrer">{value}</a></div>
      </>
    );
  }
  return (
    <>
      <div className="offer-field-label">{label}</div>
      <div className="offer-field-value" style={multiline ? { whiteSpace: 'pre-wrap' } : {}}>{value}</div>
    </>
  );
}

function range(a, b, fmt) {
  if (!a && !b) return null;
  const f = fmt || (x => x);
  if (a && b) return `${f(a)} – ${f(b)}`;
  return f(a || b);
}

function formatDate(d) {
  if (!d) return d;
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return d; }
}
