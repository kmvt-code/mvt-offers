import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabase';
import { isAuthed } from '../../../../../lib/auth';
import { findDuplicate, LIBRARY_COLUMNS } from '../../../../../lib/duplicates';
import { buildMergeUpdate } from '../../../../../lib/merge';

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
  // duplicate_of is only written at ingest, so an offer that was already sitting
  // in Pending Review before any of this existed has none. Those are exactly the
  // offers this feature is for, so work out the target here instead of refusing.
  // Recomputed rather than taken from the request, so the server merges into
  // what the matcher actually says and not into whatever the page last drew.
  let targetId = incoming.duplicate_of;
  if (!targetId) {
    const { data: library } = await supabaseAdmin
      .from('offers')
      .select(LIBRARY_COLUMNS)
      .in('status', ['published', 'pending_review']);
    const match = findDuplicate(incoming, library);
    targetId = match ? match.id : null;
  }
  if (!targetId) {
    return NextResponse.json(
      { error: 'This offer no longer looks like anything in the library, so there is nothing to merge into. Publish it as its own offer instead.' },
      { status: 400 }
    );
  }

  const { data: target, error: targetError } = await supabaseAdmin
    .from('offers').select('*').eq('id', targetId).single();
  if (targetError || !target) {
    return NextResponse.json({ error: 'The offer this was matched against no longer exists.' }, { status: 404 });
  }

  const update = buildMergeUpdate(target, incoming);

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
