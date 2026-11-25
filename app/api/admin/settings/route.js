import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { isAuthed } from '../../../../lib/auth';
import { saveSettings } from '../../../../lib/settings';

export async function POST(req) {
  if (!isAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  try {
    const saved = await saveSettings(supabaseAdmin, body);
    return NextResponse.json({ ok: true, settings: saved });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
