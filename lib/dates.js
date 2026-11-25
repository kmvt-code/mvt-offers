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

// ---------------------------------------------------------------------------
// Expiry resolution (v4). Every offer gets an end date so nothing sits in
// review just because a supplier did not write "offer ends". Order:
//   1. the booking deadline the AI found
//   2. otherwise the last travel date
//   3. otherwise the received date plus DEFAULT_EXPIRY_DAYS, marked estimated
// Each date is year-checked against the day the email arrived.
// ---------------------------------------------------------------------------

export const DEFAULT_EXPIRY_DAYS = 60;

const MONTH_INDEX = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12
};

function pad(n) { return String(n).padStart(2, '0'); }

function validDay(y, m, d) {
  if (!(y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1)) return false;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= last;
}

function iso(y, m, d) { return validDay(y, m, d) ? `${y}-${pad(m)}-${pad(d)}` : null; }

function addDays(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

// The next occurrence of month/day on or after the received date.
function nextOccurrence(m, d, received) {
  const ry = Number(received.slice(0, 4));
  const first = iso(ry, m, d);
  if (first && first >= received) return first;
  return iso(ry + 1, m, d);
}

// Reads the date shapes suppliers actually write. Returns YYYY-MM-DD or null.
// A bare year or a season ("2027", "Spring 2027") is not a date and returns null.
export function parseLooseDate(value, received = todayInPacific()) {
  if (!value) return null;
  const s = String(value).trim().toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, '$1').replace(/,/g, ' ').replace(/\s+/g, ' ');
  let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) return iso(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/))) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return iso(y, +m[1], +m[2]);
  }
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})$/))) return nextOccurrence(+m[1], +m[2], received);
  // March 19 2027 / Mar 19
  if ((m = s.match(/^([a-z]{3,9})\.? (\d{1,2})(?: (\d{4}))?$/))) {
    const mo = MONTH_INDEX[m[1].slice(0, 4) === 'sept' ? 'sept' : m[1].slice(0, 3)];
    if (!mo) return null;
    return m[3] ? iso(+m[3], mo, +m[2]) : nextOccurrence(mo, +m[2], received);
  }
  // 19 March 2027 / 19 Mar
  if ((m = s.match(/^(\d{1,2}) ([a-z]{3,9})\.?(?: (\d{4}))?$/))) {
    const mo = MONTH_INDEX[m[2].slice(0, 3)];
    if (!mo) return null;
    return m[3] ? iso(+m[3], mo, +m[1]) : nextOccurrence(mo, +m[1], received);
  }
  return null;
}

// Catches a year the AI got wrong. A deadline more than 30 days before the
// email arrived is almost always last year's number on this year's offer
// (Holland America, Nov 2026: "2025-12-03"). Moved forward a year when that
// lands within 18 months of the email.
export function correctYear(isoDate, received = todayInPacific()) {
  if (!isoDate) return null;
  if (isoDate >= addDays(received, -30)) return isoDate;
  const bumped = `${Number(isoDate.slice(0, 4)) + 1}${isoDate.slice(4)}`;
  if (validDay(+bumped.slice(0, 4), +bumped.slice(5, 7), +bumped.slice(8, 10)) && bumped >= received && bumped <= addDays(received, 548)) {
    return bumped;
  }
  return isoDate;
}

// Returns { date, source, corrected } where source is one of
// 'booking_deadline', 'travel_end', 'estimated'.
export function resolveExpiry({ offer_end_date, travel_end_window }, received = todayInPacific(), defaultDays = DEFAULT_EXPIRY_DAYS) {
  const deadline = parseLooseDate(offer_end_date, received);
  if (deadline) {
    const fixed = correctYear(deadline, received);
    return { date: fixed, source: 'booking_deadline', corrected: fixed !== deadline };
  }
  const travelEnd = parseLooseDate(travel_end_window, received);
  if (travelEnd) {
    const fixed = correctYear(travelEnd, received);
    return { date: fixed, source: 'travel_end', corrected: fixed !== travelEnd };
  }
  return { date: addDays(received, defaultDays), source: 'estimated', corrected: false };
}

// Pacific calendar day for a timestamp (created_at), for backfills.
export function pacificDay(timestamp) {
  return todayInPacific(new Date(timestamp));
}
