import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import crypto from 'crypto';
import { supabaseAdmin } from '../../lib/supabase';
import AdminDashboard from '../../components/AdminDashboard';

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

// Cap on how many published rows we load into the list at once.
// The true total is fetched separately as an exact count so the tab
// badge is always accurate even when the list itself is capped.
const PUBLISHED_LIST_LIMIT = 500;

export default async function AdminPage() {
  if (!isAuthed()) redirect('/admin/login');

  const [{ data: pending }, { data: published }, { count: publishedCount }, { data: vendors }] = await Promise.all([
    supabaseAdmin.from('offers').select('*').eq('status', 'pending_review').order('created_at', { ascending: false }),
    supabaseAdmin.from('offers').select('*').eq('status', 'published').order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(PUBLISHED_LIST_LIMIT),
    supabaseAdmin.from('offers').select('id', { count: 'exact', head: true }).eq('status', 'published'),
    supabaseAdmin.from('vendor_contacts').select('*').order('vendor_display', { ascending: true })
  ]);

  const publishedList = published || [];

  return (
    <AdminDashboard
      pending={pending || []}
      published={publishedList}
      publishedTotal={publishedCount ?? publishedList.length}
      vendors={vendors || []}
    />
  );
}
