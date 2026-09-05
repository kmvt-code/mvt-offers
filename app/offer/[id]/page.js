import { supabasePublic } from '../../../lib/supabase';
import { notFound } from 'next/navigation';
import { formatDate } from '../../../lib/dates';

export const revalidate = 60;

const LINK_FIELDS = [
  { key: 'voyage_list', label: 'Voyage list' },
  { key: 'offer_details', label: 'Offer details' },
  { key: 'client_facing_content', label: 'Client facing content' }
];

function isUrl(v) {
  return typeof v === 'string' && /^https?:\/\//i.test(v.trim());
}

function fileLabel(url) {
  const clean = url.split('?')[0].toLowerCase();
  if (clean.endsWith('.pdf')) return 'PDF attachment';
  if (clean.endsWith('.doc') || clean.endsWith('.docx')) return 'Word document';
  if (clean.endsWith('.xls') || clean.endsWith('.xlsx')) return 'Excel file';
  return 'Attachment';
}

export default async function OfferDetail({ params }) {
  // Named columns rather than *, so the public role only ever needs read access
  // to what this page shows. The offers table also holds the original vendor
  // email, the raw AI extraction and the sender address, none of which belong
  // in a public read path.
  const { data: offer } = await supabasePublic
    .from('offers')
    .select('id, vendor, supplier_type, audience, offer_overview, full_details, offer_start_date, offer_end_date, travel_start_window, travel_end_window, book_through, voyage_list, offer_details, client_facing_content, contact, attachment_urls, pinned, tags')
    .eq('id', params.id)
    .eq('status', 'published')
    .single();

  if (!offer) notFound();

  const files = (offer.attachment_urls || []).filter(Boolean);
  const fileResources = files.map((url, i) => ({
    kind: 'file',
    label: files.length > 1 ? `${fileLabel(url)} (${i + 1})` : fileLabel(url),
    url
  }));

  const linkResources = LINK_FIELDS
    .filter(f => isUrl(offer[f.key]))
    .map(f => ({ kind: 'link', label: f.label, url: offer[f.key].trim() }));

  const resources = [...fileResources, ...linkResources];

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

              {resources.length > 0 && (
                <>
                  <div className="offer-field-label">Resources</div>
                  <div className="offer-field-value">
                    {resources.map((r, i) => (
                      <div key={i} className="resource-link">
                        <a href={r.url} target="_blank" rel="noopener noreferrer">
                          {r.kind === 'file' ? '📎' : '🔗'} {r.label}
                        </a>
                      </div>
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
  // URL valued link fields are surfaced in the Resources section instead of inline
  if (link && isUrl(value)) return null;
  return (
    <>
      <div className="offer-field-label">{label}</div>
      <div className="offer-field-value" style={multiline ? { whiteSpace: 'pre-wrap' } : undefined}>{value}</div>
    </>
  );
}

function range(a, b, fmt) {
  if (!a && !b) return null;
  const f = fmt || (x => x);
  if (a && b) return `${f(a)} – ${f(b)}`;
  return f(a || b);
}
