import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';
import { findDuplicate, textOverlap, LIBRARY_COLUMNS } from '../../../lib/duplicates';
import { normalizeVendor, findVendorContact, vendorsMatch } from '../../../lib/vendors';
import { resolveExpiry, parseLooseDate, correctYear, todayInPacific } from '../../../lib/dates';
import { documentAttachments } from '../../../lib/attachments';
import { scoreConfidence, hardHolds, normalizeText } from '../../../lib/scoring';
import { loadSettings } from '../../../lib/settings';
import { buildMergeUpdate, snapshot } from '../../../lib/merge';
import { logActivity } from '../../../lib/activity';

// v4 ingest (Nov 2026). One request per email. Each item the AI returns is
// labelled offer, update or ignore:
//   offer  -> offers table: auto merged, auto published, or held for review
//   update -> supplier_updates table (the News page), no review
//   ignore -> dropped, counted in the response
// Thresholds come from app_settings (admin Settings tab).

const INTERNAL_DOMAINS = ['montecitovillagetravel.com', 'ytc.com'];
const ALLOWED_INTERNAL_CONTACT = 'marketing@ytc.com';
const UPDATE_DAYS = 90;
const UPDATE_CATEGORIES = ['Opening', 'Renovation', 'Leadership', 'Itinerary', 'Event', 'Webinar', 'Award', 'General'];

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function extractEmail(s) {
  if (!s) return null;
  const m = String(s).match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/);
  return m ? m[0].toLowerCase() : null;
}

// True if this email is internal AND is NOT the allowed marketing@ytc.com address.
function isDisallowedInternalContact(contactString) {
  const email = extractEmail(contactString);
  if (!email) return false;
  if (email === ALLOWED_INTERNAL_CONTACT) return false;
  return INTERNAL_DOMAINS.includes(email.split('@')[1]);
}

function sanitizeContact(contactString) {
  if (!contactString) return null;
  if (isDisallowedInternalContact(contactString)) return null;
  return String(contactString).trim() || null;
}

function contactsConflict(a, b) {
  const ea = extractEmail(a);
  const eb = extractEmail(b);
  if (!ea || !eb) return false;
  return ea !== eb;
}

function addDays(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

function str(v) { return v === null || v === undefined ? '' : String(v).trim(); }
function orNull(v) { const s = str(v); return s || null; }

function list(v) {
  if (Array.isArray(v)) return v.map(str).filter(Boolean);
  if (typeof v === 'string' && v.trim()) return v.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
  return [];
}

// Accepts every shape Make has sent or may send: the new single `extraction`
// field (object or JSON string), or the old `offers` (array, one object, or
// a JSON string).
function readItems(body) {
  let raw = body.extraction ?? body.extraction_json ?? body.offers;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { return null; }
  }
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.items)) return raw.items;
  if (typeof raw === 'object') return [raw];
  return null;
}

function kindOf(item) {
  const k = str(item.kind).toLowerCase();
  if (k === 'update' || k === 'news') return 'update';
  if (k === 'ignore') return 'ignore';
  return 'offer';
}

export async function POST(req) {
  const body = await req.json();

  if (body.secret !== process.env.INGEST_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { sender_email, subject } = body;
  const emailBody = body.body || body.text || '';
  const emailHtml = body.html || '';
  const items = readItems(body);
  if (items === null) return NextResponse.json({ error: 'Could not read the extraction JSON' }, { status: 400 });

  const senderDomain = (sender_email || '').split('@')[1]?.toLowerCase() || '';
  const isInternal = INTERNAL_DOMAINS.includes(senderDomain);
  const received = todayInPacific();
  const normalizedEmail = normalizeText(`${subject || ''} ${emailBody} ${emailHtml}`);
  const attachments = documentAttachments(body.attachment_urls);

  const settings = await loadSettings(supabaseAdmin);

  const [{ data: contactRows }, { data: libraryRows }] = await Promise.all([
    supabaseAdmin.from('vendor_contacts').select('vendor_normalized, vendor_display, contact'),
    supabaseAdmin.from('offers').select(LIBRARY_COLUMNS).in('status', ['published', 'pending_review'])
  ]);
  const knownContacts = contactRows || [];
  const library = libraryRows || [];

  const offers = items.filter(i => i && kindOf(i) === 'offer');
  const updates = items.filter(i => i && kindOf(i) === 'update');
  const ignored = items.length - offers.length - updates.length;

  // ---------------- News / supplier updates ----------------
  let updatesAdded = 0;
  if (updates.length) {
    const { data: recentUpdates } = await supabaseAdmin
      .from('supplier_updates').select('id, vendor, summary')
      .gte('created_at', addDays(received, -60));
    const seen = [...(recentUpdates || [])];
    const rows = [];
    for (const u of updates) {
      const summary = orNull(u.offer_overview || u.summary);
      if (!summary) continue;
      const repeat = seen.find(r => vendorsMatch(r.vendor, u.vendor) && textOverlap(r.summary, summary) >= 0.75);
      if (repeat) continue;
      const category = UPDATE_CATEGORIES.find(c => c.toLowerCase() === str(u.update_category).toLowerCase()) || 'General';
      const row = {
        status: isInternal ? 'published' : 'hidden',
        vendor: orNull(u.vendor),
        supplier_type: orNull(u.supplier_type),
        category,
        headline: orNull(u.update_headline) || summary.slice(0, 90),
        summary,
        details: orNull(u.full_details),
        properties: list(u.properties).length ? list(u.properties) : null,
        link: orNull(u.client_facing_content) || orNull(u.offer_details),
        event_date: correctYear(parseLooseDate(u.event_date || u.offer_end_date, received), received),
        contact: sanitizeContact(u.contact),
        expires_on: addDays(received, UPDATE_DAYS),
        sender_email: sender_email || null,
        original_subject: subject || null,
        original_body: emailBody || null
      };
      rows.push(row);
      seen.push({ vendor: row.vendor, summary: row.summary });
    }
    if (rows.length) {
      const { data: inserted, error } = await supabaseAdmin.from('supplier_updates').insert(rows).select('id, vendor');
      if (error) console.error('[ingest] supplier_updates insert failed', error.message);
      else updatesAdded = inserted.length;
    }
  }

  // ---------------- Offers ----------------
  const records = [];
  const plans = []; // what to do with each record after insert
  const batch = []; // records already accepted from this same email

  for (const o of offers) {
    const knownRow = findVendorContact(o.vendor, knownContacts);
    const knownContact = knownRow ? knownRow.contact : null;
    const aiContact = sanitizeContact(str(o.contact));
    let finalContact = aiContact || null;
    let conflict = null;
    if (knownContact && aiContact) {
      if (contactsConflict(aiContact, knownContact)) conflict = { ai_found: aiContact, on_file: knownContact };
    } else if (knownContact && !aiContact) {
      finalContact = knownContact;
    }

    const expiry = resolveExpiry({ offer_end_date: o.offer_end_date, travel_end_window: o.travel_end_window }, received);
    const vendorKnown = !!knownRow || library.some(l => l.status === 'published' && vendorsMatch(l.vendor, o.vendor));

    const rec = {
      status: 'pending_review',
      source: isInternal ? 'internal' : 'partner',
      sender_email,
      sender_domain: senderDomain,
      contact_conflict: conflict,
      vendor: orNull(o.vendor),
      supplier_type: orNull(o.supplier_type),
      properties: list(o.properties).length ? list(o.properties) : null,
      offer_start_date: parseLooseDate(o.offer_start_date, received),
      offer_end_date: expiry.date,
      end_date_source: expiry.source,
      travel_start_window: orNull(o.travel_start_window),
      travel_end_window: orNull(o.travel_end_window),
      audience: orNull(o.audience),
      offer_overview: orNull(o.offer_overview),
      full_details: orNull(o.full_details),
      book_through: orNull(o.book_through),
      voyage_list: orNull(o.voyage_list),
      offer_details: orNull(o.offer_details),
      client_facing_content: orNull(o.client_facing_content),
      contact: finalContact,
      attachment_urls: attachments.length ? attachments : null,
      original_subject: subject || null,
      original_body: emailBody || null,
      raw_extraction: o,
      kind_certainty: orNull(o.kind_certainty),
      evidence: {
        benefit_quote: orNull(o.benefit_quote),
        date_quote: orNull(o.date_quote),
        year_corrected: expiry.corrected || undefined
      }
    };
    // A start date after the end date means the AI swapped or misread them.
    if (rec.offer_start_date && rec.offer_start_date > rec.offer_end_date) rec.offer_start_date = null;

    const missing = ['vendor', 'offer_overview', 'audience', 'contact'].filter(f => !rec[f]);
    rec.missing_fields = missing.length ? missing : null;

    const conf = scoreConfidence(rec, { normalizedEmail, vendorKnown });
    rec.confidence = conf.score;
    rec.evidence.checks = conf.checks;
    const holds = hardHolds(rec, { isInternal, benefitVerified: conf.benefitVerified });

    // Repeats: first within this email, then against the library.
    const twin = findDuplicate(rec, batch.map((b, i) => ({ ...b, id: `batch-${i}` })));
    if (twin) {
      if (twin.score * 100 >= settings.merge_threshold) {
        plans.push(null); // same offer twice in one email, drop silently
        continue;
      }
      rec.duplicate_match = { score: twin.score, text_overlap: twin.overlap, signals: twin.signals, same_email: true, matched_vendor: twin.vendor };
      rec.review_reasons = [`looks like another offer in the same email, ${Math.round(twin.score * 100)}% match`];
      records.push(rec); plans.push({ type: 'review' }); batch.push(rec);
      continue;
    }

    const match = findDuplicate(rec, library);
    // Automatic merges only use extractions that passed the hard checks, so a
    // bad read can never overwrite a good offer that is already live.
    if (match && holds.length === 0 && match.score * 100 >= settings.merge_threshold) {
      rec.status = 'rejected';
      rec.duplicate_of = match.id;
      rec.duplicate_match = { score: match.score, text_overlap: match.overlap, signals: match.signals, matched_vendor: match.vendor };
      rec.auto_action = 'merged_auto';
      records.push(rec); plans.push({ type: 'merge', targetId: match.id, score: match.score }); batch.push(rec);
      continue;
    }
    if (match) {
      rec.duplicate_of = match.id;
      rec.duplicate_match = { score: match.score, text_overlap: match.overlap, signals: match.signals, matched_vendor: match.vendor };
      rec.review_reasons = [`looks like ${match.vendor || 'an offer'} already in the library, ${Math.round(match.score * 100)}% match`];
      records.push(rec); plans.push({ type: 'review' }); batch.push(rec);
      continue;
    }

    if (holds.length === 0 && conf.score >= settings.publish_threshold) {
      rec.status = 'published';
      rec.auto_action = 'published_auto';
      records.push(rec); plans.push({ type: 'publish', score: conf.score }); batch.push(rec);
      continue;
    }

    rec.review_reasons = [...holds];
    if (conf.score < settings.publish_threshold) rec.review_reasons.push(`confidence ${conf.score}% is below your ${settings.publish_threshold}% setting`);
    records.push(rec); plans.push({ type: 'review' }); batch.push(rec);
  }

  const realPlans = plans.filter(Boolean);
  let inserted = [];
  if (records.length) {
    const { data, error } = await supabaseAdmin.from('offers').insert(records)
      .select('id, status, vendor, contact, contact_conflict, duplicate_of, confidence, review_reasons');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    inserted = data;
  }

  let autoMerged = plans.filter(p => p === null).length;
  let autoPublished = 0;
  for (let i = 0; i < inserted.length; i += 1) {
    const row = inserted[i];
    const plan = realPlans[i];
    const rec = records[i];
    if (plan.type === 'publish') {
      autoPublished += 1;
      await logActivity(supabaseAdmin, { action: 'auto_publish', offer_id: row.id, vendor: row.vendor, score: plan.score, details: { subject } });
    }
    if (plan.type === 'merge') {
      const { data: target } = await supabaseAdmin.from('offers').select('*').eq('id', plan.targetId).single();
      if (!target) {
        await supabaseAdmin.from('offers').update({ status: 'pending_review', auto_action: null, review_reasons: ['the offer it matched no longer exists'] }).eq('id', row.id);
        continue;
      }
      const update = buildMergeUpdate(target, rec);
      const { error: mergeError } = await supabaseAdmin.from('offers').update(update).eq('id', target.id);
      if (mergeError) {
        await supabaseAdmin.from('offers').update({ status: 'pending_review', auto_action: null, review_reasons: [`automatic merge failed: ${mergeError.message}`] }).eq('id', row.id);
        continue;
      }
      autoMerged += 1;
      await logActivity(supabaseAdmin, {
        action: 'auto_merge', offer_id: row.id, target_id: target.id, vendor: row.vendor,
        score: plan.score * 100, details: { subject, before: snapshot(target) }
      });
    }
  }

  // Vendor memory, as before: only from published offers with no conflict.
  for (const rec of inserted) {
    if (rec.status === 'published' && rec.contact && rec.vendor && !rec.contact_conflict) {
      if (isDisallowedInternalContact(rec.contact)) continue;
      const existingRow = findVendorContact(rec.vendor, knownContacts);
      const key = existingRow ? existingRow.vendor_normalized : normalizeVendor(rec.vendor);
      if (!key) continue;
      await supabaseAdmin.from('vendor_contacts').upsert({
        vendor_normalized: key,
        vendor_display: existingRow ? existingRow.vendor_display : rec.vendor,
        contact: rec.contact,
        source_offer_id: rec.id
      }, { onConflict: 'vendor_normalized' });
      if (!existingRow) knownContacts.push({ vendor_normalized: key, vendor_display: rec.vendor, contact: rec.contact });
    }
  }

  const held = inserted.filter(r => r.status === 'pending_review');
  const reviewSummaryHtml = held.length
    ? '<ul>' + held.map(h =>
        `<li><strong>${escapeHtml(h.vendor || 'Unnamed offer')}</strong>: ${escapeHtml((h.review_reasons || []).join('; ') || 'needs a look')}</li>`
      ).join('') + '</ul>'
    : '';

  const notifyCc = isInternal && sender_email
    ? [{ address: String(sender_email).trim().toLowerCase() }]
    : [];

  return NextResponse.json({
    ok: true,
    inserted: inserted.length,
    statuses: inserted.map(d => d.status),
    needs_review: held.length > 0,
    auto_published: autoPublished,
    auto_merged: autoMerged,
    updates_added: updatesAdded,
    ignored,
    suspected_duplicates: held.filter(h => h.duplicate_of).length,
    review_items: held.map(h => ({ id: h.id, vendor: h.vendor, confidence: h.confidence, reasons: h.review_reasons || [] })),
    review_summary_html: reviewSummaryHtml,
    notify_cc: notifyCc
  });
}
