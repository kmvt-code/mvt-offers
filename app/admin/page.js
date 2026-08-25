import { redirect } from 'next/navigation';
import { supabaseAdmin } from '../../lib/supabase';
import { todayInPacific } from '../../lib/dates';
import AdminDashboard from '../../components/AdminDashboard';
import { isAuthed } from '../../lib/auth';

// Cap on how many published rows we load into the list at once.
// The tab badges are fetched separately as exact counts, so they stay
// accurate even when the list itself is capped.
const PUBLISHED_LIST_LIMIT = 500;

export default async function AdminPage() {
  if (!isAuthed()) redirect('/admin/login');

  // Pacific date, matching the public RLS policy on public.offers.
  const today = todayInPacific();

  const published = () => supabaseAdmin.from('offers').select('id', { count: 'exact', head: true }).eq('status', 'published');

  const [
    { data: pending },
    { data: publishedRows },
    { count: publishedTotal },
    { count: notLiveTotal },
    { count: scheduledTotal },
    { count: expiredTotal },
    { data: vendors }
  ] = await Promise.all([
    supabaseAdmin.from('offers').select('*').eq('status', 'pending_review').order('created_at', { ascending: false }),
    supabaseAdmin.from('offers').select('*').eq('status', 'published').order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(PUBLISHED_LIST_LIMIT),
    published(),
    // Not live = ended before today, or not started yet. One row can match
    // both only if its dates are contradictory; or() counts it once.
    published().or(`offer_end_date.lt.${today},offer_start_date.gt.${today}`),
    published().gt('offer_start_date', today),
    published().lt('offer_end_date', today),
    supabaseAdmin.from('vendor_contacts').select('*').order('vendor_display', { ascending: true })
  ]);

  const publishedList = publishedRows || [];
  const liveTotal = publishedTotal != null && notLiveTotal != null
    ? Math.max(0, publishedTotal - notLiveTotal)
    : null;

  return (
    <AdminDashboard
      pending={pending || []}
      published={publishedList}
      liveTotal={liveTotal}
      scheduledTotal={scheduledTotal}
      expiredTotal={expiredTotal}
      vendors={vendors || []}
    />
  );
}
