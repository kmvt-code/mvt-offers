'use client';

import { useState, useMemo, useEffect } from 'react';

const SUPPLIER_TYPES = ['Cruise', 'River Cruise', 'Tour', 'Hotel', 'Air', 'Wholesaler', 'Package', 'Train'];
const VIEW_STORAGE_KEY = 'mvt_offer_view';

export default function OfferList({ offers }) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [audienceFilter, setAudienceFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [view, setView] = useState('tiles');

  // Restore the viewer's saved layout on the client only, so the server
  // and first client render agree and React does not warn about a mismatch.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(VIEW_STORAGE_KEY);
      if (saved === 'tiles' || saved === 'columns') setView(saved);
    } catch (e) { /* storage unavailable, keep the default */ }
  }, []);

  function chooseView(next) {
    setView(next);
    try { window.localStorage.setItem(VIEW_STORAGE_KEY, next); } catch (e) { /* ignore */ }
  }

  const allTags = useMemo(() => {
    const set = new Set();
    offers.forEach(o => (o.tags || []).forEach(t => set.add(t)));
    return Array.from(set).sort();
  }, [offers]);

  const filtered = useMemo(() => {
    return offers.filter(o => {
      if (typeFilter !== 'all' && o.supplier_type !== typeFilter) return false;
      if (audienceFilter !== 'all') {
        const a = (o.audience || '').toLowerCase();
        if (audienceFilter === 'Advisor' && !a.includes('advisor')) return false;
        if (audienceFilter === 'Client' && !a.includes('client')) return false;
      }
      if (tagFilter !== 'all') {
        if (!o.tags || !o.tags.includes(tagFilter)) return false;
      }
      if (search) {
        const t = search.toLowerCase();
        const blob = `${o.vendor || ''} ${o.offer_overview || ''} ${o.supplier_type || ''} ${(o.tags || []).join(' ')}`.toLowerCase();
        if (!blob.includes(t)) return false;
      }
      return true;
    });
  }, [offers, search, typeFilter, audienceFilter, tagFilter]);

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

      {allTags.length > 0 && (
        <div className="filter-section">
          <span className="filter-label">Tags</span>
          <button className={`filter-chip ${tagFilter === 'all' ? 'active' : ''}`} onClick={() => setTagFilter('all')}>All</button>
          {allTags.map(t => (
            <button key={t} className={`filter-chip ${tagFilter === t ? 'active' : ''}`} onClick={() => setTagFilter(t)}>#{t}</button>
          ))}
        </div>
      )}

      <div className="list-toolbar">
        <span className="list-count">
          {filtered.length} offer{filtered.length === 1 ? '' : 's'}
        </span>
        <div className="view-toggle" role="group" aria-label="Choose layout">
          <button
            type="button"
            className={view === 'tiles' ? 'active' : ''}
            aria-pressed={view === 'tiles'}
            onClick={() => chooseView('tiles')}
          >
            <span aria-hidden="true">▦</span> Tiles
          </button>
          <button
            type="button"
            className={view === 'columns' ? 'active' : ''}
            aria-pressed={view === 'columns'}
            onClick={() => chooseView('columns')}
          >
            <span aria-hidden="true">▤</span> Columns
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty">No offers match your filters</div>
      ) : view === 'columns' ? (
        <div className="offer-columns-scroll">
          <div className="offer-columns">
            <div className="offer-col-head">
              <div>Vendor</div>
              <div>Type</div>
              <div>Audience</div>
              <div>Offer window</div>
              <div>Tags</div>
            </div>
            {filtered.map(o => <OfferRow key={o.id} offer={o} />)}
          </div>
        </div>
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
    <a href={`/offer/${offer.id}`} className={`offer-card ${offer.pinned ? 'pinned' : ''}`}>
      <h3 className="offer-card-vendor">
        {offer.pinned && <span className="featured-badge">Featured</span>}
        {offer.vendor || 'Unnamed offer'}
      </h3>
      {offer.offer_overview && <p className="offer-card-overview">{offer.offer_overview}</p>}
      <div className="offer-tags" style={{ marginTop: 'auto' }}>
        {offer.supplier_type && <span className="tag tag-type">{offer.supplier_type}</span>}
        {offer.audience && <span className="tag tag-audience">{offer.audience}</span>}
        {offer.offer_end_date && <span className="tag tag-date">Through {formatDate(offer.offer_end_date)}</span>}
 {offer.attachment_urls?.length > 0 && (
          <span className="tag tag-attachment">📎 {offer.attachment_urls.length} file{offer.attachment_urls.length === 1 ? '' : 's'}</span>
        )}
        {['voyage_list','offer_details','client_facing_content'].some(k => /^https?:\/\//i.test(offer[k] || '')) && (
          <span className="tag tag-attachment">🔗 link</span>
        )}
        {offer.tags?.map(t => <span key={t} className="tag tag-custom">#{t}</span>)}
      </div>
    </a>
  );
}

function OfferRow({ offer }) {
  return (
    <a href={`/offer/${offer.id}`} className="offer-row">
      <div className="offer-row-vendor">
        {offer.pinned && <span className="featured-badge">Featured</span>}
        <span className="offer-row-name">{offer.vendor || 'Unnamed offer'}</span>
      </div>
      <div className="offer-col-muted">{offer.supplier_type || ''}</div>
      <div className="offer-col-muted">{offer.audience || ''}</div>
      <div className="offer-col-muted">{offer.offer_end_date ? `Through ${formatDate(offer.offer_end_date)}` : ''}</div>
      <div className="offer-tags offer-row-tags">
        {(offer.tags || []).slice(0, 3).map(t => <span key={t} className="tag tag-custom">#{t}</span>)}
        {offer.attachment_urls?.length > 0 && (
          <span className="tag tag-attachment">📎 {offer.attachment_urls.length}</span>
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
