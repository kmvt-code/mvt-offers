'use client';

import { useState } from 'react';

export default function AdminDashboard({ pending, published, vendors }) {
  const [tab, setTab] = useState('pending');
  const [editing, setEditing] = useState(null);

  async function action(id, status) {
    await fetch('/api/admin/offers/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status })
    });
    window.location.reload();
  }

  async function publishWithContact(id, contact) {
    await fetch('/api/admin/offers/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'published', fields: { contact } })
    });
    window.location.reload();
  }

  async function logout() {
    await fetch('/api/admin/logout', { method: 'POST' });
    window.location.href = '/admin/login';
  }

  if (editing) {
    return <EditForm offer={editing} onCancel={() => setEditing(null)} onSaved={() => window.location.reload()} />;
  }

  return (
    <>
      <div className="admin-bar">
        <div className="container admin-bar-inner">
          <a href="/admin" style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18 }}>MVT Admin</a>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <a href="/" style={{ fontSize: 13 }}>View site →</a>
            <button onClick={logout} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'white', padding: '6px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>Sign out</button>
          </div>
        </div>
      </div>

      <main className="container" style={{ paddingBottom: 60 }}>
        <div className="admin-tabs">
          <span className={`admin-tab ${tab === 'pending' ? 'active' : ''}`} onClick={() => setTab('pending')}>
            Pending Review ({pending.length})
          </span>
          <span className={`admin-tab ${tab === 'published' ? 'active' : ''}`} onClick={() => setTab('published')}>
            Published ({published.length})
          </span>
          <span className={`admin-tab ${tab === 'vendors' ? 'active' : ''}`} onClick={() => setTab('vendors')}>
            Vendor Contacts ({vendors.length})
          </span>
        </div>

        {tab === 'pending' && <PendingTab pending={pending} action={action} setEditing={setEditing} publishWithContact={publishWithContact} />}
        {tab === 'published' && <PublishedTab published={published} action={action} setEditing={setEditing} />}
        {tab === 'vendors' && <VendorsTab vendors={vendors} />}
      </main>
    </>
  );
}

function PendingTab({ pending, action, setEditing, publishWithContact }) {
  if (pending.length === 0) return <div className="empty">No offers awaiting review.</div>;
  return pending.map(o => (
    <div key={o.id} className="review-card">
      <div className="review-card-meta">
        <span>From: {o.sender_email || 'unknown sender'}</span>
        <span>•</span>
        <span>{o.source === 'partner' ? 'Partner submission' : 'Internal'}</span>
        <span>•</span>
        <span>{new Date(o.created_at).toLocaleDateString()}</span>
      </div>
      <div className="review-card-vendor">{o.vendor || 'Unnamed offer'}</div>
      <div className="offer-tags">
        {o.supplier_type && <span className="tag tag-type">{o.supplier_type}</span>}
        {o.audience && <span className="tag tag-audience">{o.audience}</span>}
        {o.offer_start_date && <span className="tag tag-date">From {fmt(o.offer_start_date)}</span>}
        {o.offer_end_date && <span className="tag tag-date">Through {fmt(o.offer_end_date)}</span>}
      </div>
      {o.offer_overview && <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '12px 0', lineHeight: 1.5 }}>{o.offer_overview}</p>}

      {o.missing_fields?.length > 0 && (
        <div className="missing-list">
          <strong>Missing required fields:</strong> {o.missing_fields.join(', ')}
        </div>
      )}

      {o.contact_conflict && (
        <div className="conflict-box">
          <div className="conflict-title">Contact mismatch — pick one</div>
          <div className="conflict-options">
            <button className="conflict-option" onClick={() => publishWithContact(o.id, o.contact_conflict.ai_found)}>
              <div className="conflict-option-label">From this email</div>
              <div className="conflict-option-value">{o.contact_conflict.ai_found}</div>
            </button>
            <button className="conflict-option" onClick={() => publishWithContact(o.id, o.contact_conflict.on_file)}>
              <div className="conflict-option-label">On file for {o.vendor}</div>
              <div className="conflict-option-value">{o.contact_conflict.on_file}</div>
            </button>
          </div>
        </div>
      )}

      <div className="review-actions">
        {!o.contact_conflict && (!o.missing_fields || o.missing_fields.length === 0) && (
          <button className="btn btn-approve" onClick={() => action(o.id, 'published')}>Approve & Publish</button>
        )}
        <button className="btn btn-edit" onClick={() => setEditing(o)}>Edit & Approve</button>
        <button className="btn btn-reject" onClick={() => action(o.id, 'rejected')}>Reject</button>
      </div>
    </div>
  ));
}

function PublishedTab({ published, action, setEditing }) {
  if (published.length === 0) return <div className="empty">No published offers yet.</div>;
  const today = new Date().toISOString().split('T')[0];
  return published.map(o => {
    const notYetVisible = o.offer_start_date && o.offer_start_date > today;
    return (
      <div key={o.id} className="review-card">
        <div className="review-card-vendor">
          {o.vendor || 'Unnamed offer'}
          {notYetVisible && <span className="tag tag-pending" style={{ marginLeft: 10, fontSize: 11 }}>Scheduled • visible {fmt(o.offer_start_date)}</span>}
        </div>
        <div className="offer-tags">
          {o.supplier_type && <span className="tag tag-type">{o.supplier_type}</span>}
          {o.audience && <span className="tag tag-audience">{o.audience}</span>}
          {o.offer_start_date && <span className="tag tag-date">From {fmt(o.offer_start_date)}</span>}
          {o.offer_end_date && <span className="tag tag-date">Through {fmt(o.offer_end_date)}</span>}
        </div>
        {o.offer_overview && <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '12px 0' }}>{o.offer_overview}</p>}
        <div className="review-actions">
          <button className="btn btn-edit" onClick={() => setEditing(o)}>Edit</button>
          <button className="btn btn-reject" onClick={() => action(o.id, 'rejected')}>Unpublish</button>
        </div>
      </div>
    );
  });
}

function VendorsTab({ vendors }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [editingKey, setEditingKey] = useState(null);
  const [editValue, setEditValue] = useState('');

  async function save(vendor_display, contactValue) {
    await fetch('/api/admin/vendors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'upsert', vendor_display, contact: contactValue })
    });
    window.location.reload();
  }

  async function remove(vendor_normalized) {
    if (!confirm('Remove this vendor contact from memory?')) return;
    await fetch('/api/admin/vendors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', vendor_normalized })
    });
    window.location.reload();
  }

  return (
    <>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 18, lineHeight: 1.5 }}>
        Saved contacts for each vendor. When an email arrives without a contact, the saved one is used. When the email contains a different email address than what's saved, you'll be asked to pick during review.
      </p>

      {!adding && (
        <button className="btn btn-primary" style={{ marginBottom: 18 }} onClick={() => setAdding(true)}>+ Add vendor contact</button>
      )}
      {adding && (
        <div className="vendor-add">
          <input placeholder="Vendor name (e.g. AmaWaterways)" value={name} onChange={e => setName(e.target.value)} />
          <input placeholder="Contact (e.g. Jane Smith, jane@amawaterways.com)" value={contact} onChange={e => setContact(e.target.value)} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-approve" onClick={() => save(name, contact)} disabled={!name || !contact}>Save</button>
            <button className="btn btn-edit" onClick={() => { setAdding(false); setName(''); setContact(''); }}>Cancel</button>
          </div>
        </div>
      )}

      {vendors.length === 0 && !adding ? (
        <div className="empty">No vendor contacts saved yet. Each time you approve an offer, the contact is remembered automatically.</div>
      ) : (
        <div className="vendor-list">
          {vendors.map(v => (
            <div key={v.id} className="vendor-row">
              <div className="vendor-row-name">{v.vendor_display}</div>
              {editingKey === v.vendor_normalized ? (
                <>
                  <input className="vendor-row-edit" value={editValue} onChange={e => setEditValue(e.target.value)} />
                  <button className="btn btn-approve" onClick={() => save(v.vendor_display, editValue)}>Save</button>
                  <button className="btn btn-edit" onClick={() => setEditingKey(null)}>Cancel</button>
                </>
              ) : (
                <>
                  <div className="vendor-row-contact">{v.contact}</div>
                  <button className="btn btn-edit" onClick={() => { setEditingKey(v.vendor_normalized); setEditValue(v.contact); }}>Edit</button>
                  <button className="btn btn-reject" onClick={() => remove(v.vendor_normalized)}>Remove</button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function fmt(d) {
  if (!d) return d;
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return d; }
}

const FIELDS = [
  { key: 'vendor', label: 'Vendor' },
  { key: 'supplier_type', label: 'Supplier Type', options: ['Cruise', 'River Cruise', 'Tour', 'Hotel', 'Air', 'Wholesaler', 'Package', 'Train'] },
  { key: 'audience', label: 'Audience', options: ['Client', 'Advisor', 'Client and Advisor'] },
  { key: 'offer_start_date', label: 'Offer Start Date', type: 'date' },
  { key: 'offer_end_date', label: 'Offer End Date', type: 'date' },
  { key: 'travel_start_window', label: 'Travel Start Window' },
  { key: 'travel_end_window', label: 'Travel End Window' },
  { key: 'book_through', label: 'Book Through' },
  { key: 'voyage_list', label: 'Voyage List' },
  { key: 'offer_details', label: 'Offer Details' },
  { key: 'client_facing_content', label: 'Client Facing Content' },
  { key: 'contact', label: 'Contact' },
  { key: 'offer_overview', label: 'Offer Overview', multiline: true, full: true },
  { key: 'full_details', label: 'Full Details', multiline: true, full: true }
];

function EditForm({ offer, onCancel, onSaved }) {
  const [data, setData] = useState({ ...offer });
  const [saving, setSaving] = useState(false);

  function set(k, v) { setData(d => ({ ...d, [k]: v })); }

  async function save() {
    setSaving(true);
    await fetch('/api/admin/offers/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: offer.id, fields: data })
    });
    onSaved();
  }

  async function publish() {
    setSaving(true);
    await fetch('/api/admin/offers/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: offer.id, fields: data, status: 'published' })
    });
    onSaved();
  }

  return (
    <main className="container" style={{ paddingTop: 24, paddingBottom: 60 }}>
      <button className="btn btn-edit" onClick={onCancel} style={{ marginBottom: 14 }}>← Cancel</button>
      <div className="edit-form">
        <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: 'var(--navy)', marginBottom: 18 }}>Edit offer</h2>
        <div className="edit-form-grid">
          {FIELDS.map(f => (
            <div key={f.key} className={f.full ? 'full' : ''}>
              <label>{f.label}</label>
              {f.options ? (
                <select value={data[f.key] || ''} onChange={e => set(f.key, e.target.value)}>
                  <option value="">—</option>
                  {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : f.multiline ? (
                <textarea value={data[f.key] || ''} onChange={e => set(f.key, e.target.value)} />
              ) : (
                <input type={f.type || 'text'} value={data[f.key] || ''} onChange={e => set(f.key, e.target.value)} />
              )}
            </div>
          ))}
        </div>
        <div className="review-actions" style={{ marginTop: 20 }}>
          {offer.status !== 'published' && <button className="btn btn-approve" onClick={publish} disabled={saving}>Save & Publish</button>}
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          <button className="btn btn-edit" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </main>
  );
}
