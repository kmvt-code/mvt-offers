import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import { supabaseAdmin } from '../../../../lib/supabase';

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
  const { action, vendor_display, contact, vendor_normalized } = body;

  if (action === 'upsert') {
    if (!vendor_display || !contact) return NextResponse.json({ error: 'Missing vendor or contact' }, { status: 400 });
    if (isDisallowedInternalContact(contact)) {
      return NextResponse.json({
        error: 'Internal MVT email addresses cannot be saved as a vendor contact (except marketing@ytc.com).'
      }, { status: 400 });
    }
    const key = normalizeVendor(vendor_display);
    const { error } = await supabaseAdmin.from('vendor_contacts').upsert({
      vendor_normalized: key,
      vendor_display,
      contact
    }, { onConflict: 'vendor_normalized' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === 'delete') {
    if (!vendor_normalized) return NextResponse.json({ error: 'Missing vendor key' }, { status: 400 });
    const { error } = await supabaseAdmin.from('vendor_contacts').delete().eq('vendor_normalized', vendor_normalized);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
