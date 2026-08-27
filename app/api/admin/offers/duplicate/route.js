import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabase';
import { isAuthed } from '../../../../../lib/auth';

// Fields a merge carries over from the incoming offer onto the one already in
// the library. Deliberately excludes id, created_at and pinned so the existing
// offer keeps its link, its place in the list, and whether it is featured.
const MERGE_FIELDS = [
  'vendor', 'supplier_type', 'audience', 'offer_start_date', 'offer_end_date',
  'travel_start_window', 'travel_end_window', 'book_through', 'voyage_list',
  'offer_details', 'client_facing_content', 'contact', 'offer_overview', 'full_details'
];

function isEmpty(value) {
  return value === null || value === undefined || String(value).trim() === '';
}

function union(a, b) {
  const merged = [...(a || []), ...(b || [])]
    .map(v => (typeof v === 'string' ? v.trim() : v))
    .filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const v of merged) {
    const key = String(v).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out.length ? out : null;
}

export async function POST(req) {
  if (!isAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, action } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  if (!['merge', 'keep', 'discard'].includes(action)) {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }

  const { data: incoming, error: loadError } = await supabaseAdmin
    .from('offers').select('*').eq('id', id).single();
  if (loadError || !incoming) {
    return NextResponse.json({ error: 'Offer not found' }, { status: 404 });
  }

  // Keep both: this is its own offer, so clear the flag and publish it.
  if (action === 'keep') {
    if (!incoming.offer_end_date) {
      return NextResponse.json({ error: 'Offer end date is required to publish this offer.' }, { status: 400 });
    }
    const { error } = await supabaseAdmin
      .from('offers')
      .update({ status: 'published', duplicate_of: null, duplicate_match: null })
      .eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, action, id });
  }

  // Discard: the offer is already in the library, so this copy is not needed.
  // Rejected rather than deleted, so the trail survives.
  if (action === 'discard') {
    const { error } = await supabaseAdmin
      .from('offers').update({ status: 'rejected' }).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, action, id });
  }

  // Merge: update the existing offer in place, then retire this copy.
  if (!incoming.duplicate_of) {
    return NextResponse.json(
      { error: 'This offer is not linked to an existing one, so there is nothing to merge into.' },
      { status: 400 }
    );
  }

  const { data: target, error: targetError } = await supabaseAdmin
    .from('offers').select('*').eq('id', incoming.duplicate_of).single();
  if (targetError || !target) {
    return NextResponse.json({ error: 'The offer this was matched against no longer exists.' }, { status: 404 });
  }

  const update = {};
  for (const field of MERGE_FIELDS) {
    if (!isEmpty(incoming[field])) update[field] = incoming[field];
  }
  // Attachments and tags accumulate rather than replace: a follow-up email
  // usually adds a flyer, it does not retract the previous one.
  const mergedAttachments = union(target.attachment_urls, incoming.attachment_urls);
  if (mergedAttachments) update.attachment_urls = mergedAttachments;
  const mergedTags = union(target.tags, incoming.tags);
  if (mergedTags) update.tags = mergedTags;

  if (!update.offer_end_date && !target.offer_end_date) {
    return NextResponse.json({ error: 'Offer end date is required to publish this offer.' }, { status: 400 });
  }
  update.status = 'published';

  const { error: mergeError } = await supabaseAdmin
    .from('offers').update(update).eq('id', target.id);
  if (mergeError) return NextResponse.json({ error: mergeError.message }, { status: 500 });

  const { error: retireError } = await supabaseAdmin
    .from('offers').update({ status: 'rejected' }).eq('id', id);
  if (retireError) return NextResponse.json({ error: retireError.message }, { status: 500 });

  return NextResponse.json({ ok: true, action, merged_into: target.id, fields_updated: Object.keys(update).length });
}
