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

export default async function AdminPage() {
  if (!isAuthed()) redirect('/admin/login');

  const [{ data: pending }, { data: published }, { data: vendors }] = await Promise.all([
    supabaseAdmin.from('offers').select('*').eq('status', 'pending_review').order('created_at', { ascending: false }),
    supabaseAdmin.from('offers').select('*').eq('status', 'published').order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(100),
    supabaseAdmin.from('vendor_contacts').select('*').order('vendor_display', { ascending: true })
  ]);

  return <AdminDashboard pending={pending || []} published={published || []} vendors={vendors || []} />;
}
