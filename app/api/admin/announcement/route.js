import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { isAuthed } from '../../../../lib/auth';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function cleanDate(v) {
  if (!v) return null;
  const s = String(v).trim();
  return DATE.test(s) ? s : undefined;
}

// One announcement at a time. Saving edits the row passed in, or starts a new
// one. Removing switches it off rather than deleting it, so there is a record
// of what was shown and when.
export async function POST(req) {
  if (!isAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { action, id } = body;

  if (action === 'remove') {
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    const { error } = await supabaseAdmin.from('announcements').update({ active: false }).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action !== 'save') return NextResponse.json({ error: 'Unknown action' }, { status: 400 });

  const message = String(body.message || '').trim();
  if (!message) return NextResponse.json({ error: 'The announcement needs a message.' }, { status: 400 });
  if (message.length > 600) return NextResponse.json({ error: 'Keep the announcement under 600 characters.' }, { status: 400 });

  const start_date = cleanDate(body.start_date);
  const end_date = cleanDate(body.end_date);
  if (start_date === undefined || end_date === undefined) {
    return NextResponse.json({ error: 'Dates must be in YYYY-MM-DD form.' }, { status: 400 });
  }
  if (start_date && end_date && end_date < start_date) {
    return NextResponse.json({ error: 'The end date is before the start date.' }, { status: 400 });
  }

  const row = { message, start_date, end_date, active: true };

  // Only one banner should ever be on. Switch off any others first.
  const others = supabaseAdmin.from('announcements').update({ active: false }).eq('active', true);
  const { error: offError } = id ? await others.neq('id', id) : await others;
  if (offError) return NextResponse.json({ error: offError.message }, { status: 500 });

  const { error } = id
    ? await supabaseAdmin.from('announcements').update(row).eq('id', id)
    : await supabaseAdmin.from('announcements').insert(row);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
