import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { isAuthed } from '../../../../lib/auth';

// Show or hide a News item. Hidden items stay in the table for the record.
export async function POST(req) {
  if (!isAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id, status } = await req.json().catch(() => ({}));
  if (!id || !['published', 'hidden'].includes(status)) {
    return NextResponse.json({ error: 'Missing id or status' }, { status: 400 });
  }
  const { error } = await supabaseAdmin.from('supplier_updates').update({ status }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
