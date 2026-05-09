'use client';

import { useState, useMemo } from 'react';

const SUPPLIER_TYPES = ['Cruise', 'River Cruise', 'Tour', 'Hotel', 'Air', 'Wholesaler', 'Package', 'Train'];
const AUDIENCES = ['Client', 'Advisor', 'Client and Advisor'];

export default function OfferList({ offers }) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [audienceFilter, setAudienceFilter] = useState('all');

  const filtered = useMemo(() => {
    return offers.filter(o => {
      if (typeFilter !== 'all' && o.supplier_type !== typeFilter) return false;
      if (audienceFilter !== 'all') {
        const a = (o.audience || '').toLowerCase();
        if (audienceFilter === 'Advisor' && !a.includes('advisor')) return false;
        if (audienceFilter === 'Client' && !a.includes('client')) return false;
      }
      if (search) {
        const t = search.toLowerCase();
        const blob = `${o.vendor || ''} ${o.offer_overview || ''} ${o.supplier_type || ''}`.toLowerCase();
        if (!blob.includes(t)) return false;
      }
      return true;
    });
  }, [offers, search, typeFilter, audienceFilter]);

  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search vendor, destination, keyword…"
          style={{
            width: '100%', maxWidth: 480, padding: '10px 16px',
            border: '1px solid var(--border)', borderRadius: 8,
            fontSize: 14, fontFamily: 'inherit', background: 'white'
          }}
        />
      </div>

      <div className="filter-section">
        <span className="filter-label">Supplier</span>
        <button className={`filter-chip ${typeFilter === 'all' ? 'active' : ''}`} onClick={() => setTypeFilter('all')}>All</button>
        {SUPPLIER_TYPES.map(t => (
          <button key={t} className={`filter-chip ${typeFilter === t ? 'active' : ''}`} onClick={() => setTypeFilter(t)}>{t}</button>
        ))}
      </div>

      <div className="filter-section">
        <span className="filter-label">Audience</span>
        <button className={`filter-chip ${audienceFilter === 'all' ? 'active' : ''}`} onClick={() => setAudienceFilter('all')}>All</button>
        <button className={`filter-chip ${audienceFilter === 'Advisor' ? 'active' : ''}`} onClick={() => setAudienceFilter('Advisor')}>Advisor</button>
        <button className={`filter-chip ${audienceFilter === 'Client' ? 'active' : ''}`} onClick={() => setAudienceFilter('Client')}>Client</button>
      </div>

      <div style={{ marginBottom: 14, fontSize: 13, color: 'var(--text-muted)' }}>
        {filtered.length} offer{filtered.length === 1 ? '' : 's'}
      </div>

      {filtered.length === 0 ? (
        <div className="empty">No offers match your filters</div>
      ) : (
        <div className="offer-grid">
          {filtered.map(o => <OfferCard key={o.id} offer={o} />)}
        </div>
      )}
    </>
  );
}

function OfferCard({ offer }) {
  return (
    <a href={`/offer/${offer.id}`} className="offer-card">
      <h3 className="offer-card-vendor">{offer.vendor || 'Unnamed offer'}</h3>
      {offer.offer_overview && <p className="offer-card-overview">{offer.offer_overview}</p>}
      <div className="offer-tags" style={{ marginTop: 'auto' }}>
        {offer.supplier_type && <span className="tag tag-type">{offer.supplier_type}</span>}
        {offer.audience && <span className="tag tag-audience">{offer.audience}</span>}
        {offer.offer_end_date && <span className="tag tag-date">Through {formatDate(offer.offer_end_date)}</span>}
        {offer.attachment_urls?.length > 0 && (
          <span className="tag tag-attachment">📎 {offer.attachment_urls.length} file{offer.attachment_urls.length === 1 ? '' : 's'}</span>
        )}
      </div>
    </a>
  );
}

function formatDate(d) {
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return d; }
}
