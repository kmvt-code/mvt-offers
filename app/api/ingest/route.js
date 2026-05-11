import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';

const INTERNAL_DOMAINS = ['montecitovillagetravel.com', 'ytc.com'];
const ALLOWED_INTERNAL_CONTACT = 'marketing@ytc.com';
const REQUIRED_FIELDS = ['vendor', 'offer_overview', 'audience', 'offer_end_date', 'contact'];

function normalizeVendor(v) {
  if (!v) return '';
  return String(v).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function extractEmail(s) {
  if (!s) return null;
  const m = String(s).match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/);
  return m ? m[0].toLowerCase() : null;
}

// True if this email is internal AND is NOT the allowed marketing@ytc.com address.
// We don't want forwarders' personal emails (jane@ytc.com) ending up as the vendor contact.
function isDisallowedInternalContact(contactString) {
  const email = extractEmail(contactString);
  if (!email) return false;
  if (email === ALLOWED_INTERNAL_CONTACT) return false;
  const domain = email.split('@')[1];
  return INTERNAL_DOMAINS.includes(domain);
}

// Returns the contact string only if it passes the internal-filter rule.
// If the AI returned an internal address that isn't marketing@ytc.com, we treat it as if no contact was found.
function sanitizeContact(contactString) {
  if (!contactString) return null;
  if (isDisallowedInternalContact(contactString)) return null;
  return contactString.trim() || null;
}

function contactsConflict(a, b) {
  const ea = extractEmail(a);
  const eb = extractEmail(b);
  if (!ea || !eb) return false;
  return ea !== eb;
}

export async function POST(req) {
  const body = await req.json();

  if (body.secret !== process.env.INGEST_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { sender_email, subject, body: emailBody, attachment_urls = [], offers = [] } = body;
  if (!offers.length) return NextResponse.json({ error: 'No offers provided' }, { status: 400 });

  const senderDomain = (sender_email || '').split('@')[1]?.toLowerCase() || '';
  const isInternal = INTERNAL_DOMAINS.includes(senderDomain);

  const vendorKeys = [...new Set(offers.map(o => normalizeVendor(o.vendor)).filter(Boolean))];
  const { data: knownContacts } = vendorKeys.length
    ? await supabaseAdmin.from('vendor_contacts').select('vendor_normalized, contact').in('vendor_normalized', vendorKeys)
    : { data: [] };
  const contactMap = Object.fromEntries((knownContacts || []).map(c => [c.vendor_normalized, c.contact]));

  const records = offers.map(o => {
    const vendorKey = normalizeVendor(o.vendor);
    const knownContact = contactMap[vendorKey];

    // Filter out internal personal addresses from what the AI extracted.
    // marketing@ytc.com IS allowed.
    const aiContactRaw = o.contact && String(o.contact).trim();
    const aiContact = sanitizeContact(aiContactRaw);

    let finalContact = aiContact || null;
    let conflict = null;

    if (knownContact && aiContact) {
      if (contactsConflict(aiContact, knownContact)) {
        conflict = { ai_found: aiContact, on_file: knownContact };
        finalContact = aiContact;
      }
    } else if (knownContact && !aiContact) {
      finalContact = knownContact;
    }

    const fieldsForRequiredCheck = { ...o, contact: finalContact };
    const missing = REQUIRED_FIELDS.filter(f => !fieldsForRequiredCheck[f] || String(fieldsForRequiredCheck[f]).trim() === '');

    const status = (isInternal && missing.length === 0 && !conflict) ? 'published' : 'pending_review';

    return {
      status,
      source: isInternal ? 'internal' : 'partner',
      sender_email,
      sender_domain: senderDomain,
      missing_fields: missing.length ? missing : null,
      contact_conflict: conflict,
      vendor: o.vendor || null,
      supplier_type: o.supplier_type || null,
      offer_start_date: parseDate(o.offer_start_date),
      offer_end_date: parseDate(o.offer_end_date),
      travel_start_window: o.travel_start_window || null,
      travel_end_window: o.travel_end_window || null,
      audience: o.audience || null,
      offer_overview: o.offer_overview || null,
      full_details: o.full_details || null,
      book_through: o.book_through || null,
      voyage_list: o.voyage_list || null,
      offer_details: o.offer_details || null,
      client_facing_content: o.client_facing_content || null,
      contact: finalContact,
      attachment_urls: attachment_urls.length ? attachment_urls : null,
      original_subject: subject || null,
      original_body: emailBody || null,
      raw_extraction: o
    };
  });

  const { data, error } = await supabaseAdmin.from('offers').insert(records).select('id, status, vendor, contact, contact_conflict');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Save vendor memory only when:
  //  - Offer is published
  //  - Has a contact
  //  - Contact is NOT a disallowed internal address (already filtered above, but double-check)
  //  - No unresolved conflict
  for (const rec of data) {
    if (rec.status === 'published' && rec.contact && rec.vendor && !rec.contact_conflict) {
      if (isDisallowedInternalContact(rec.contact)) continue;
      const key = normalizeVendor(rec.vendor);
      if (!key) continue;
      await supabaseAdmin.from('vendor_contacts').upsert({
        vendor_normalized: key,
        vendor_display: rec.vendor,
        contact: rec.contact,
        source_offer_id: rec.id
      }, { onConflict: 'vendor_normalized' });
    }
  }

  const needsReview = records.some(r => r.status === 'pending_review');

  return NextResponse.json({
    ok: true,
    inserted: data.length,
    statuses: data.map(d => d.status),
    needs_review: needsReview
  });
}

function parseDate(value) {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) return `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  return null;
}
