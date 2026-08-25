import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabase';
import { isAuthed } from '../../../../../lib/auth';

export async function POST(req) {
  if (!isAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { ids, action } = await req.json();
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'No ids provided' }, { status: 400 });
  }

  let update = {};
  if (action === 'publish') {
    update = { status: 'published', contact_conflict: null, missing_fields: null };
  } else if (action === 'reject') {
    update = { status: 'rejected' };
  } else if (action === 'pin') {
    update = { pinned: true };
  } else if (action === 'unpin') {
    update = { pinned: false };
  } else {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from('offers').update(update).in('id', ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, count: ids.length });
}
