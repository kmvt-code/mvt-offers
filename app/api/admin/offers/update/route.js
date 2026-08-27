import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabase';
import { isAuthed } from '../../../../../lib/auth';

const INTERNAL_DOMAINS = ['montecitovillagetravel.com', 'ytc.com'];
const ALLOWED_INTERNAL_CONTACT = 'marketing@ytc.com';

function normalizeVendor(v) {
  if (!v) return '';
  return String(v).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function extractEmail(s) {
  if (!s) return null;
  const m = String(s).match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/);
  return m ? m[0].toLowerCase() : null;
}

function isDisallowedInternalContact(contactString) {
  const email = extractEmail(contactString);
  if (!email) return false;
  if (email === ALLOWED_INTERNAL_CONTACT) return false;
  const domain = email.split('@')[1];
  return INTERNAL_DOMAINS.includes(domain);
}

function parseTags(input) {
  if (!input) return null;
  if (Array.isArray(input)) return input.map(t => String(t).trim()).filter(Boolean);
  return String(input).split(',').map(t => t.trim()).filter(Boolean);
}

export async function POST(req) {
  if (!isAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, status, fields } = body;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const update = {};
  if (status) update.status = status;
  // Publishing or rejecting settles any duplicate question, so the flag goes
  // with it. Otherwise a resolved offer keeps a stale "possible duplicate".
  if (status === 'published' || status === 'rejected') {
    update.duplicate_of = null;
    update.duplicate_match = null;
  }
  if (fields) {
    const allowed = ['vendor', 'supplier_type', 'audience', 'offer_start_date', 'offer_end_date',
      'travel_start_window', 'travel_end_window', 'book_through', 'voyage_list',
      'offer_details', 'client_facing_content', 'contact', 'offer_overview', 'full_details'];
    for (const k of allowed) {
      if (k in fields) update[k] = fields[k] || null;
    }
    if ('pinned' in fields) update.pinned = !!fields.pinned;
    if ('tags' in fields) update.tags = parseTags(fields.tags);
    if ('attachment_urls' in fields) {
      const urls = Array.isArray(fields.attachment_urls) ? fields.attachment_urls.filter(u => u && String(u).trim()) : null;
      update.attachment_urls = urls && urls.length ? urls : null;
    }
  }

  if (status === 'published') {
    // Fall back to the date already stored. Approve & Publish sends only an id
    // and a status, so checking the payload alone rejected every offer that
    // already had an end date on it.
    let effectiveEndDate = 'offer_end_date' in update ? update.offer_end_date : (fields ? fields.offer_end_date : null);
    if (!effectiveEndDate) {
      const { data: current } = await supabaseAdmin
        .from('offers').select('offer_end_date').eq('id', id).single();
      effectiveEndDate = current ? current.offer_end_date : null;
    }
    if (!effectiveEndDate) {
      return NextResponse.json({ error: 'Offer end date is required to publish this offer.' }, { status: 400 });
    }
    update.contact_conflict = null;
    update.missing_fields = null;
  }

  const { data: updated, error } = await supabaseAdmin
    .from('offers')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (
    updated.status === 'published'
    && updated.vendor
    && updated.contact
    && !isDisallowedInternalContact(updated.contact)
  ) {
    const key = normalizeVendor(updated.vendor);
    if (key) {
      await supabaseAdmin.from('vendor_contacts').upsert({
        vendor_normalized: key,
        vendor_display: updated.vendor,
        contact: updated.contact,
        source_offer_id: updated.id
      }, { onConflict: 'vendor_normalized' });
    }
  }

  return NextResponse.json({ ok: true });
}
