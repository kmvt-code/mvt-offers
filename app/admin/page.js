import { redirect } from 'next/navigation';
import { supabaseAdmin } from '../../lib/supabase';
import { todayInPacific } from '../../lib/dates';
import { findDuplicate } from '../../lib/duplicates';
import AdminDashboard from '../../components/AdminDashboard';
import { isAuthed } from '../../lib/auth';

// Cap on how many published rows we load into the list at once.
// The tab badges are fetched separately as exact counts, so they stay
// accurate even when the list itself is capped.
const PUBLISHED_LIST_LIMIT = 500;

// Columns a search looks at. Deliberately the text a person would remember an
// offer by, not every column.
const SEARCH_COLUMNS = [
  'vendor', 'offer_overview', 'full_details', 'offer_details',
  'client_facing_content', 'voyage_list', 'book_through', 'contact',
  'supplier_type', 'audience'
];

// PostgREST's or() is a comma and parenthesis separated grammar, so those
// characters in a search term would break the query rather than be searched for.
// Stripped rather than escaped: there is no escaping for them in this syntax.
function searchFilter(term) {
  const clean = String(term || '').replace(/[,()*%\\]/g, ' ').trim();
  if (!clean) return null;
  return SEARCH_COLUMNS.map(c => `${c}.ilike.*${clean}*`).join(',');
}

export default async function AdminPage({ searchParams }) {
  if (!isAuthed()) redirect('/admin/login');

  const rawQuery = typeof searchParams?.q === 'string' ? searchParams.q : '';
  const filter = searchFilter(rawQuery);

  // Pacific date, matching the public RLS policy on public.offers.
  const today = todayInPacific();

  const withSearch = q => (filter ? q.or(filter) : q);

  // The exact-count queries already use or() for the date logic, and stacking a
  // second or() on top of that leans on how PostgREST combines two of them.
  // Rather than bet on it, a search skips these entirely and the tab counts come
  // from the rows actually fetched. Accurate while a search returns fewer than
  // the list cap, which the note below makes visible when it does not.
  const published = () => supabaseAdmin.from('offers').select('id', { count: 'exact', head: true }).eq('status', 'published');
  const noCount = Promise.resolve({ count: null });

  const [
    { data: pending },
    { data: publishedRows },
    { count: publishedTotal },
    { count: notLiveTotal },
    { count: scheduledTotal },
    { count: expiredTotal },
    { data: vendors }
  ] = await Promise.all([
    withSearch(supabaseAdmin.from('offers').select('*').eq('status', 'pending_review')).order('created_at', { ascending: false }),
    withSearch(supabaseAdmin.from('offers').select('*').eq('status', 'published')).order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(PUBLISHED_LIST_LIMIT),
    filter ? noCount : published(),
    // Not live = ended before today, or not started yet. One row can match
    // both only if its dates are contradictory; or() counts it once.
    filter ? noCount : published().or(`offer_end_date.lt.${today},offer_start_date.gt.${today}`),
    filter ? noCount : published().gt('offer_start_date', today),
    filter ? noCount : published().lt('offer_end_date', today),
    supabaseAdmin.from('vendor_contacts').select('*').order('vendor_display', { ascending: true })
  ]);

  const publishedList = publishedRows || [];
  const pendingList = pending || [];

  // Lookup so a suspected duplicate can be shown beside the offer it matched.
  const offersById = {};
  for (const o of [...publishedList, ...pendingList]) offersById[o.id] = o;

  // Score every offer awaiting review against the library, on every load, rather
  // than trusting the flag written at ingest. Three reasons: offers that arrived
  // before this existed have no flag and would never get one, a stored flag goes
  // stale when the offer it pointed at is rejected, and the library moves under
  // it. The point is to catch the repeat before it goes live, so the check
  // belongs at the moment of review.
  const library = [...publishedList, ...pendingList];
  const pendingScored = pendingList.map(o => {
    const match = findDuplicate(o, library);
    if (!match) return { ...o, duplicate_of: null, duplicate_match: null };
    return {
      ...o,
      duplicate_of: match.id,
      duplicate_match: {
        score: match.score,
        text_overlap: match.overlap,
        signals: match.signals,
        matched_vendor: match.vendor
      }
    };
  });
  const liveTotal = publishedTotal != null && notLiveTotal != null
    ? Math.max(0, publishedTotal - notLiveTotal)
    : null;

  return (
    <AdminDashboard
      query={rawQuery}
      publishedShown={publishedList.length}
      publishedTotal={publishedTotal}
      publishedLimit={PUBLISHED_LIST_LIMIT}
      pending={pendingScored}
      published={publishedList}
      offersById={offersById}
      liveTotal={liveTotal}
      scheduledTotal={scheduledTotal}
      expiredTotal={expiredTotal}
      vendors={vendors || []}
    />
  );
}
