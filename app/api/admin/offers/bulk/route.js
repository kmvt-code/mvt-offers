import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabase';
import { isAuthed } from '../../../../../lib/auth';
import { findDuplicate } from '../../../../../lib/duplicates';

export async function POST(req) {
  if (!isAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { ids, action } = await req.json();
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'No ids provided' }, { status: 400 });
  }

  // Publishing in bulk used to skip every check the one-at-a-time path makes:
  // no end date guard, no duplicate check, and the duplicate flags were left on
  // the row afterwards. Clearing a backlog is exactly when repeats cluster, so
  // this is the path that most needed them.
  if (action === 'publish') {
    const { data: chosen, error: loadError } = await supabaseAdmin
      .from('offers').select('*').in('id', ids);
    if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });
    if (!chosen || chosen.length === 0) {
      return NextResponse.json({ error: 'None of those offers exist.' }, { status: 404 });
    }

    const { data: library, error: libError } = await supabaseAdmin
      .from('offers')
      .select('id, vendor, supplier_type, offer_start_date, offer_end_date, offer_overview')
      .in('status', ['published', 'pending_review']);
    if (libError) return NextResponse.json({ error: libError.message }, { status: 500 });

    const publishable = [];
    const skipped = [];

    for (const offer of chosen) {
      if (!offer.offer_end_date) {
        skipped.push({ id: offer.id, vendor: offer.vendor, reason: 'no offer end date' });
        continue;
      }
      // Compare against the library minus the others in this same selection, so
      // publishing two genuinely distinct offers together does not have them
      // block each other. Repeats within the selection are caught below.
      const others = library.filter(l => !ids.includes(l.id));
      const match = findDuplicate(offer, others);
      if (match) {
        skipped.push({
          id: offer.id,
          vendor: offer.vendor,
          reason: `looks like ${match.vendor || 'an offer already in the library'}, ${Math.round(match.score * 100)}% match`
        });
        continue;
      }
      // And against the ones already cleared in this batch, so the same offer
      // selected twice does not go live twice.
      const twin = findDuplicate(offer, publishable);
      if (twin) {
        skipped.push({
          id: offer.id,
          vendor: offer.vendor,
          reason: `looks like ${twin.vendor || 'another offer'} in this same selection, ${Math.round(twin.score * 100)}% match`
        });
        continue;
      }
      publishable.push(offer);
    }

    let publishedCount = 0;
    if (publishable.length) {
      const { error } = await supabaseAdmin
        .from('offers')
        .update({ status: 'published', contact_conflict: null, missing_fields: null, duplicate_of: null, duplicate_match: null })
        .in('id', publishable.map(o => o.id));
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      publishedCount = publishable.length;
    }

    return NextResponse.json({ ok: true, action, count: publishedCount, skipped });
  }

  let update = {};
  if (action === 'reject') {
    update = { status: 'rejected', duplicate_of: null, duplicate_match: null };
  } else if (action === 'pin') {
    update = { pinned: true };
  } else if (action === 'unpin') {
    update = { pinned: false };
  } else {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from('offers').update(update).in('id', ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, action, count: ids.length, skipped: [] });
}
