import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import { supabaseAdmin } from '../../../../../lib/supabase';

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
