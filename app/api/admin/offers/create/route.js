import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabase';
import { isAuthed } from '../../../../../lib/auth';

function parseTags(input) {
  if (!input) return null;
  if (Array.isArray(input)) return input.map(t => String(t).trim()).filter(Boolean);
  return String(input).split(',').map(t => t.trim()).filter(Boolean);
}

export async function POST(req) {
  if (!isAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const f = body.fields || {};

  const record = {
    status: body.publish ? 'published' : 'pending_review',
    source: 'internal',
    sender_email: 'manual@admin',
    sender_domain: 'admin',
    vendor: f.vendor || null,
    supplier_type: f.supplier_type || null,
    offer_start_date: f.offer_start_date || null,
    offer_end_date: f.offer_end_date || null,
    travel_start_window: f.travel_start_window || null,
    travel_end_window: f.travel_end_window || null,
    audience: f.audience || null,
    offer_overview: f.offer_overview || null,
    full_details: f.full_details || null,
    book_through: f.book_through || null,
    voyage_list: f.voyage_list || null,
    offer_details: f.offer_details || null,
    client_facing_content: f.client_facing_content || null,
    contact: f.contact || null,
    pinned: !!f.pinned,
    tags: parseTags(f.tags),
    attachment_urls: Array.isArray(f.attachment_urls) && f.attachment_urls.length ? f.attachment_urls.filter(u => u && String(u).trim()) : null,
    original_subject: 'Manually added via admin',
    original_body: null
  };

  const { data, error } = await supabaseAdmin.from('offers').insert(record).select('id').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, id: data.id });
}
