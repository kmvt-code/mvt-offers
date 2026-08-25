// Offer dates in Supabase are Postgres `date` values: a plain calendar day with
// no time and no timezone. `new Date('2026-09-29')` parses that as UTC midnight,
// so formatting it in a browser west of UTC used to render the previous day.
//
// MVT works in Pacific time, and dates are entered and submitted as Pacific
// dates. We therefore render the stored calendar day as-is, which means every
// viewer sees the same date anywhere in the world, and the server and the
// browser always agree (no hydration mismatch).

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const MVT_TIME_ZONE = 'America/Los_Angeles';

export function formatDate(d) {
  if (!d) return '';
  const s = String(d).trim();

  // Plain calendar date, e.g. 2026-09-29. Format it directly, no Date object.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) {
    const month = MONTHS[Number(m[2]) - 1];
    if (month) return `${month} ${Number(m[3])}, ${m[1]}`;
  }

  // Anything with a real time component is a timestamp: show it in Pacific.
  try {
    return new Date(s).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', timeZone: MVT_TIME_ZONE
    });
  } catch {
    return s;
  }
}

// Today's date in Pacific terms, as YYYY-MM-DD, which is the shape Supabase
// date filters expect. `new Date().toISOString()` gives the UTC day, which
// rolls over at 5pm Pacific, so an offer on its last day looked expired all
// evening. Assembled from parts rather than a locale string so it does not
// depend on ICU formatting quirks.
//
// This must stay in step with the row-level-security policy on public.offers,
// which uses (now() at time zone 'America/Los_Angeles')::date.
export function todayInPacific(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MVT_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const get = type => parts.find(p => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
