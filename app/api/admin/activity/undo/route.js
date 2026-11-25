import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabase';
import { isAuthed } from '../../../../../lib/auth';
import { SNAPSHOT_FIELDS } from '../../../../../lib/merge';

// Reverses one automatic (or bulk) action from the Activity tab.
export async function POST(req) {
  if (!isAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const { data: entry, error } = await supabaseAdmin.from('activity_log').select('*').eq('id', id).single();
  if (error || !entry) return NextResponse.json({ error: 'Activity not found' }, { status: 404 });
  if (entry.undone_at) return NextResponse.json({ error: 'Already undone' }, { status: 400 });

  const fail = e => NextResponse.json({ error: e.message || String(e) }, { status: 500 });

  if (entry.action === 'auto_publish') {
    const { error: e } = await supabaseAdmin.from('offers')
      .update({ status: 'pending_review', auto_action: null, review_reasons: ['automatic publish was undone'] })
      .eq('id', entry.offer_id);
    if (e) return fail(e);
  } else if (entry.action === 'auto_merge' || entry.action === 'manual_merge') {
    const before = entry.details && entry.details.before;
    if (before && entry.target_id) {
      const restore = {};
      for (const f of SNAPSHOT_FIELDS) if (f in before) restore[f] = before[f];
      const { error: e1 } = await supabaseAdmin.from('offers').update(restore).eq('id', entry.target_id);
      if (e1) return fail(e1);
    }
    const { error: e2 } = await supabaseAdmin.from('offers')
      .update({ status: 'pending_review', auto_action: null, review_reasons: ['merge was undone'] })
      .eq('id', entry.offer_id);
    if (e2) return fail(e2);
  } else if (entry.action === 'moved_to_news') {
    if (entry.update_id) {
      const { error: e1 } = await supabaseAdmin.from('supplier_updates').delete().eq('id', entry.update_id);
      if (e1) return fail(e1);
    }
    const previous = (entry.details && entry.details.previous_status) || 'pending_review';
    const { error: e2 } = await supabaseAdmin.from('offers').update({ status: previous, auto_action: null }).eq('id', entry.offer_id);
    if (e2) return fail(e2);
  } else {
    return NextResponse.json({ error: 'This action cannot be undone' }, { status: 400 });
  }

  await supabaseAdmin.from('activity_log').update({ undone_at: new Date().toISOString() }).eq('id', id);
  return NextResponse.json({ ok: true });
}
