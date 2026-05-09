import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import { supabaseAdmin } from '../../../../../lib/supabase';

const INTERNAL_DOMAINS = ['montecitovillagetravel.com', 'ytc.com'];
const ALLOWED_INTERNAL_CONTACT = 'marketing@ytc.com';

function isAuthed() {
  const c = cookies().get('mvt_admin_session');
  if (!c) return false;
  const parts = c.value.split(':');
  if (parts.length !== 3) return false;
  const [valid, expires, sig] = parts;
  const secret = process.env.ADMIN_SESSION_SECRET;
  const expected = crypto.createHmac('sha256', secret).update(`${valid}:${expires}`).digest('hex');
  if (sig !== expected) return false;
  if (parseInt(expires, 10) < Date.now()) return false;
  return valid === 'valid';
}

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

export async function POST(req) {
  if (!isAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, status, fields } = body;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const update = {};
  if (status) update.status = status;
  if (fields) {
    const allowed = ['vendor', 'supplier_type', 'audience', 'offer_start_date', 'offer_end_date',
      'travel_start_window', 'travel_end_window', 'book_through', 'voyage_list',
      'offer_details', 'client_facing_content', 'contact', 'offer_overview', 'full_details'];
    for (const k of allowed) {
      if (k in fields) update[k] = fields[k] || null;
    }
  }

  if (status === 'published') {
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

  // Refresh vendor memory ONLY if the contact is valid for memory:
  // - Offer published, has vendor and contact
  // - Contact is NOT a disallowed internal address
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
