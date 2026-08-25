'use client';

import { useState } from 'react';
import { formatDate, todayInPacific } from '../lib/dates';

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
  { key: 'tags', label: 'Tags (comma-separated)', full: true, hint: 'e.g. Caribbean, Family-friendly, Last Minute' },
  { key: 'offer_overview', label: 'Offer Overview', multiline: true, full: true },
  { key: 'full_details', label: 'Full Details', multiline: true, full: true }
];

export default function AdminDashboard({ pending, published, liveTotal, scheduledTotal, expiredTotal, vendors }) {
  const [tab, setTab] = useState('pending');
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState(new Set());

  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() { setSelected(new Set()); }

  async function action(id, status) {
    await fetch('/api/admin/offers/update', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status })
    });
    window.location.reload();
  }

  async function togglePin(id, currentPinned) {
    await fetch('/api/admin/offers/update', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, fields: { pinned: !currentPinned } })
    });
    window.location.reload();
  }

  async function publishWithContact(id, contact) {
    await fetch('/api/admin/offers/update', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'published', fields: { contact } })
    });
    window.location.reload();
  }

  async function bulkAction(actionName) {
    const ids = Array.from(selected);
    if (!ids.length) return;
    await fetch('/api/admin/offers/bulk', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, action: actionName })
    });
    window.location.reload();
  }

  async function logout() {
    await fetch('/api/admin/logout', { method: 'POST' });
    window.location.href = '/admin/login';
  }

  if (creating) {
    return <CreateForm onCancel={() => setCreating(false)} onSaved={() => window.location.reload()} />;
  }
  if (editing) {
    return <EditForm offer={editing} onCancel={() => setEditing(null)} onSaved={() => window.location.reload()} />;
  }

  const showBulk = selected.size > 0;
  const isPublishedTab = tab === 'live' || tab === 'scheduled' || tab === 'expired';

  // Pacific date, matching the public RLS policy on public.offers.
  const today = todayInPacific();
  const isExpired = o => o.offer_end_date && o.offer_end_date < today;
  const isScheduled = o => o.offer_start_date && o.offer_start_date > today;

  const liveRows = published.filter(o => !isExpired(o) && !isScheduled(o));
  const scheduledRows = published.filter(isScheduled);
  const expiredRows = published.filter(isExpired);

  const publishedTabs = {
    live: { rows: liveRows, total: liveTotal, empty: 'No offers are live right now.' },
    scheduled: { rows: scheduledRows, total: scheduledTotal, empty: 'Nothing is scheduled to go live later.' },
    expired: { rows: expiredRows, total: expiredTotal, empty: 'No published offers have expired.' }
  };

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
          <span className={`admin-tab ${tab === 'pending' ? 'active' : ''}`} onClick={() => { setTab('pending'); clearSelection(); }}>
            Pending Review ({pending.length})
          </span>
          <span className={`admin-tab ${tab === 'live' ? 'active' : ''}`} onClick={() => { setTab('live'); clearSelection(); }}>
            Live ({liveTotal ?? liveRows.length})
          </span>
          <span className={`admin-tab ${tab === 'scheduled' ? 'active' : ''}`} onClick={() => { setTab('scheduled'); clearSelection(); }}>
            Scheduled ({scheduledTotal ?? scheduledRows.length})
          </span>
          <span className={`admin-tab ${tab === 'expired' ? 'active' : ''}`} onClick={() => { setTab('expired'); clearSelection(); }}>
            Expired ({expiredTotal ?? expiredRows.length})
          </span>
          <span className={`admin-tab ${tab === 'vendors' ? 'active' : ''}`} onClick={() => { setTab('vendors'); clearSelection(); }}>
            Vendor Contacts ({vendors.length})
          </span>
          <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setCreating(true)}>+ New offer</button>
        </div>

        {showBulk && (
          <div className="bulk-bar">
            <span><strong>{selected.size}</strong> selected</span>
            {tab === 'pending' && <button className="btn btn-approve" onClick={() => bulkAction('publish')}>Publish all</button>}
            {isPublishedTab && (
              <>
                <button className="btn btn-edit" onClick={() => bulkAction('pin')}>Pin all</button>
                <button className="btn btn-edit" onClick={() => bulkAction('unpin')}>Unpin all</button>
              </>
            )}
            <button className="btn btn-reject" onClick={() => bulkAction('reject')}>
              {tab === 'pending' ? 'Reject all' : 'Unpublish all'}
            </button>
            <button className="btn btn-edit" style={{ marginLeft: 'auto' }} onClick={clearSelection}>Clear</button>
          </div>
        )}

        {tab === 'pending' && <PendingTab pending={pending} action={action} setEditing={setEditing} publishWithContact={publishWithContact} selected={selected} toggleSelect={toggleSelect} />}
        {isPublishedTab && <PublishedTab published={publishedTabs[tab].rows} emptyMessage={publishedTabs[tab].empty} action={action} setEditing={setEditing} togglePin={togglePin} selected={selected} toggleSelect={toggleSelect} />}
        {tab === 'vendors' && <VendorsTab vendors={vendors} />}
      </main>
    </>
  );
}

function PendingTab({ pending, action, setEditing, publishWithContact, selected, toggleSelect }) {
  if (pending.length === 0) return <div className="empty">No offers awaiting review.</div>;
  return pending.map(o => (
    <div key={o.id} className="review-card">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggleSelect(o.id)} style={{ marginTop: 4, cursor: 'pointer' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
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
            {o.tags?.map(t => <span key={t} className="tag tag-custom">#{t}</span>)}
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
      </div>
    </div>
  ));
}

function PublishedTab({ published, emptyMessage, action, setEditing, togglePin, selected, toggleSelect }) {
  if (published.length === 0) return <div className="empty">{emptyMessage}</div>;
  const today = todayInPacific();
  return published.map(o => {
    const notYetVisible = o.offer_start_date && o.offer_start_date > today;
    return (
      <div key={o.id} className="review-card">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggleSelect(o.id)} style={{ marginTop: 4, cursor: 'pointer' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="review-card-vendor">
              {o.pinned && <span style={{ marginRight: 8 }}>📌</span>}
              {o.vendor || 'Unnamed offer'}
              {notYetVisible && <span className="tag tag-pending" style={{ marginLeft: 10, fontSize: 11 }}>Scheduled • visible {fmt(o.offer_start_date)}</span>}
            </div>
            <div className="offer-tags">
              {o.supplier_type && <span className="tag tag-type">{o.supplier_type}</span>}
              {o.audience && <span className="tag tag-audience">{o.audience}</span>}
              {o.offer_start_date && <span className="tag tag-date">From {fmt(o.offer_start_date)}</span>}
              {o.offer_end_date && <span className="tag tag-date">Through {fmt(o.offer_end_date)}</span>}
              {o.tags?.map(t => <span key={t} className="tag tag-custom">#{t}</span>)}
            </div>
            {o.offer_overview && <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '12px 0' }}>{o.offer_overview}</p>}
            <div className="review-actions">
              <button className="btn btn-edit" onClick={() => togglePin(o.id, o.pinned)}>{o.pinned ? '📌 Unpin' : '📌 Pin'}</button>
              <button className="btn btn-edit" onClick={() => setEditing(o)}>Edit</button>
              <button className="btn btn-reject" onClick={() => action(o.id, 'rejected')}>Unpublish</button>
            </div>
          </div>
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
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'upsert', vendor_display, contact: contactValue })
    });
    window.location.reload();
  }

  async function remove(vendor_normalized) {
    if (!confirm('Remove this vendor contact from memory?')) return;
    await fetch('/api/admin/vendors', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', vendor_normalized })
    });
    window.location.reload();
  }

  return (
    <>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 18, lineHeight: 1.5 }}>
        Saved contacts for each vendor. When an email arrives without a contact, the saved one is used.
      </p>
      {!adding && <button className="btn btn-primary" style={{ marginBottom: 18 }} onClick={() => setAdding(true)}>+ Add vendor contact</button>}
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
        <div className="empty">No vendor contacts saved yet.</div>
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
  return formatDate(d);
}

function EditForm({ offer, onCancel, onSaved }) {
  const initialTags = Array.isArray(offer.tags) ? offer.tags.join(', ') : '';
  const [data, setData] = useState({ ...offer, tags: initialTags });
  const [attachments, setAttachments] = useState(offer.attachment_urls || []);
  const [newUrl, setNewUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [endDateError, setEndDateError] = useState('');

  function set(k, v) { setData(d => ({ ...d, [k]: v })); }

  function addAttachment() {
    const u = newUrl.trim();
    if (!u) return;
    setAttachments(prev => [...prev, u]);
    setNewUrl('');
  }
  function removeAttachment(idx) {
    setAttachments(prev => prev.filter((_, i) => i !== idx));
  }

  async function save(publish) {
    if (publish && !data.offer_end_date) { setEndDateError('Offer end date is required to publish this offer.'); return; }
    setEndDateError('');
    setSaving(true);
    const fields = { ...data, attachment_urls: attachments };
    const res = await fetch('/api/admin/offers/update', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: offer.id, fields, ...(publish ? { status: 'published' } : {}) })
    });
    if (!res.ok) { const err = await res.json().catch(() => ({})); setEndDateError(err.error || 'Something went wrong while saving.'); setSaving(false); return; }
    onSaved();
  }

  return (
    <main className="container" style={{ paddingTop: 24, paddingBottom: 60 }}>
      <button className="btn btn-edit" onClick={onCancel} style={{ marginBottom: 14 }}>← Cancel</button>
      <div className="edit-form">
        <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: 'var(--navy)', marginBottom: 18 }}>Edit offer</h2>

        <div style={{ marginBottom: 18, display: 'flex', gap: 14, alignItems: 'center', padding: 12, background: 'var(--cream)', borderRadius: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
            <input type="checkbox" checked={!!data.pinned} onChange={e => set('pinned', e.target.checked)} />
            📌 Pin to top of public site
          </label>
        </div>

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
                <input type={f.type || 'text'} value={data[f.key] || ''} onChange={e => set(f.key, e.target.value)} placeholder={f.hint || ''} />
              )}
              {f.hint && <div className="form-hint">{f.hint}</div>}
               {f.key === 'offer_end_date' && endDateError && <div className="form-error" style={{ color: '#b42318', fontSize: 12, marginTop: 4 }}>{endDateError}</div>}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--cream-dark)' }}>
          <label style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', marginBottom: 8 }}>Attachments</label>
          {attachments.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>No attachments.</div>}
          {attachments.map((url, i) => (
            <div key={i} className="attachment-row">
              <a href={url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, fontSize: 13, color: 'var(--navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📎 {url}</a>
              <button className="btn btn-reject" onClick={() => removeAttachment(i)} type="button">Remove</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <input type="text" value={newUrl} onChange={e => setNewUrl(e.target.value)} placeholder="Paste an attachment URL (e.g. from HubSpot Files)" style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13, fontFamily: 'inherit', background: 'var(--cream)' }} />
            <button className="btn btn-edit" onClick={addAttachment} type="button">+ Add</button>
          </div>
        </div>

        <div className="review-actions" style={{ marginTop: 24 }}>
          {offer.status !== 'published' && <button className="btn btn-approve" onClick={() => save(true)} disabled={saving}>Save & Publish</button>}
          <button className="btn btn-primary" onClick={() => save(false)} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          <button className="btn btn-edit" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </main>
  );
}

function CreateForm({ onCancel, onSaved }) {
  const [data, setData] = useState({ pinned: false, tags: '' });
  const [attachments, setAttachments] = useState([]);
  const [newUrl, setNewUrl] = useState('');
  const [saving, setSaving] = useState(false);

  function set(k, v) { setData(d => ({ ...d, [k]: v })); }
  function addAttachment() { const u = newUrl.trim(); if (!u) return; setAttachments(p => [...p, u]); setNewUrl(''); }
  function removeAttachment(idx) { setAttachments(p => p.filter((_, i) => i !== idx)); }

  async function save(publish) {
    if (!data.vendor || !data.offer_overview) {
      alert('Vendor and Offer Overview are required.');
      return;
    }
    setSaving(true);
    const fields = { ...data, attachment_urls: attachments };
    await fetch('/api/admin/offers/create', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields, publish })
    });
    onSaved();
  }

  return (
    <main className="container" style={{ paddingTop: 24, paddingBottom: 60 }}>
      <button className="btn btn-edit" onClick={onCancel} style={{ marginBottom: 14 }}>← Cancel</button>
      <div className="edit-form">
        <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: 'var(--navy)', marginBottom: 18 }}>Create new offer</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 18 }}>Manually add an offer to the library. Vendor and Offer Overview are required.</p>

        <div style={{ marginBottom: 18, display: 'flex', gap: 14, alignItems: 'center', padding: 12, background: 'var(--cream)', borderRadius: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
            <input type="checkbox" checked={!!data.pinned} onChange={e => set('pinned', e.target.checked)} />
            📌 Pin to top of public site
          </label>
        </div>

        <div className="edit-form-grid">
          {FIELDS.map(f => (
            <div key={f.key} className={f.full ? 'full' : ''}>
              <label>{f.label}{(f.key === 'vendor' || f.key === 'offer_overview') && <span style={{ color: 'var(--gold)' }}> *</span>}</label>
              {f.options ? (
                <select value={data[f.key] || ''} onChange={e => set(f.key, e.target.value)}>
                  <option value="">—</option>
                  {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : f.multiline ? (
                <textarea value={data[f.key] || ''} onChange={e => set(f.key, e.target.value)} />
              ) : (
                <input type={f.type || 'text'} value={data[f.key] || ''} onChange={e => set(f.key, e.target.value)} placeholder={f.hint || ''} />
              )}
              {f.hint && <div className="form-hint">{f.hint}</div>}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--cream-dark)' }}>
          <label style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', marginBottom: 8 }}>Attachments</label>
          {attachments.map((url, i) => (
            <div key={i} className="attachment-row">
              <a href={url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, fontSize: 13, color: 'var(--navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📎 {url}</a>
              <button className="btn btn-reject" onClick={() => removeAttachment(i)} type="button">Remove</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <input type="text" value={newUrl} onChange={e => setNewUrl(e.target.value)} placeholder="Paste an attachment URL" style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13, fontFamily: 'inherit', background: 'var(--cream)' }} />
            <button className="btn btn-edit" onClick={addAttachment} type="button">+ Add</button>
          </div>
        </div>

        <div className="review-actions" style={{ marginTop: 24 }}>
          <button className="btn btn-approve" onClick={() => save(true)} disabled={saving}>{saving ? 'Saving…' : 'Save & Publish'}</button>
          <button className="btn btn-primary" onClick={() => save(false)} disabled={saving}>Save as draft (pending)</button>
          <button className="btn btn-edit" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </main>
  );
}
