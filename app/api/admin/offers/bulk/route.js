import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabase';
import { isAuthed } from '../../../../../lib/auth';
import { findDuplicate, LIBRARY_COLUMNS } from '../../../../../lib/duplicates';
import { buildMergeUpdate, snapshot } from '../../../../../lib/merge';
import { logActivity } from '../../../../../lib/activity';
import { todayInPacific } from '../../../../../lib/dates';

function addDays(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// Turns offers that are really news into supplier updates. Shared with the
// single Move to News button, which posts here with one id.
async function moveToNews(ids) {
  const { data: chosen, error } = await supabaseAdmin.from('offers').select('*').in('id', ids);
  if (error) throw new Error(error.message);
  const today = todayInPacific();
  let moved = 0;
  for (const o of chosen || []) {
    const summary = o.offer_overview || o.full_details;
    if (!summary) continue;
    const { data: row, error: insError } = await supabaseAdmin.from('supplier_updates').insert({
      status: 'published',
      vendor: o.vendor,
      supplier_type: o.supplier_type,
      category: 'General',
      headline: summary.slice(0, 90),
      summary,
      details: o.full_details,
      properties: o.properties || null,
      link: o.client_facing_content || o.offer_details || null,
      contact: o.contact,
      expires_on: addDays(today, 90),
      sender_email: o.sender_email,
      original_subject: o.original_subject,
      original_body: o.original_body,
      from_offer_id: o.id
    }).select('id').single();
    if (insError) throw new Error(insError.message);
    await supabaseAdmin.from('offers').update({ status: 'rejected', auto_action: 'moved_to_news', duplicate_of: null, duplicate_match: null }).eq('id', o.id);
    await logActivity(supabaseAdmin, { action: 'moved_to_news', offer_id: o.id, update_id: row.id, vendor: o.vendor, details: { previous_status: o.status } });
    moved += 1;
  }
  return moved;
}

// Merges each selected offer into the library offer it best matches.
async function mergeSelected(ids) {
  const { data: chosen, error } = await supabaseAdmin.from('offers').select('*').in('id', ids);
  if (error) throw new Error(error.message);
  const { data: library } = await supabaseAdmin.from('offers').select(LIBRARY_COLUMNS).in('status', ['published', 'pending_review']);
  const others = (library || []).filter(l => !ids.includes(l.id));
  let merged = 0;
  const skipped = [];
  for (const o of chosen || []) {
    const match = findDuplicate(o, others);
    if (!match) { skipped.push({ id: o.id, vendor: o.vendor, reason: 'no matching offer in the library' }); continue; }
    const { data: target } = await supabaseAdmin.from('offers').select('*').eq('id', match.id).single();
    if (!target) { skipped.push({ id: o.id, vendor: o.vendor, reason: 'matched offer no longer exists' }); continue; }
    const update = buildMergeUpdate(target, o);
    if (!update.offer_end_date && !target.offer_end_date) { skipped.push({ id: o.id, vendor: o.vendor, reason: 'no end date on either offer' }); continue; }
    update.status = 'published';
    const { error: mErr } = await supabaseAdmin.from('offers').update(update).eq('id', target.id);
    if (mErr) { skipped.push({ id: o.id, vendor: o.vendor, reason: mErr.message }); continue; }
    await supabaseAdmin.from('offers').update({ status: 'rejected', duplicate_of: target.id }).eq('id', o.id);
    await logActivity(supabaseAdmin, { action: 'manual_merge', offer_id: o.id, target_id: target.id, vendor: o.vendor, score: match.score * 100, details: { before: snapshot(target) } });
    merged += 1;
  }
  return { merged, skipped };
}

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
      .select(LIBRARY_COLUMNS)
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

  if (action === 'to_news') {
    try {
      const count = await moveToNews(ids);
      return NextResponse.json({ ok: true, action, count, skipped: [] });
    } catch (e) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }

  if (action === 'merge') {
    try {
      const { merged, skipped } = await mergeSelected(ids);
      return NextResponse.json({ ok: true, action, count: merged, skipped });
    } catch (e) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
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
