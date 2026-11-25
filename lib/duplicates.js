// Detecting offers that are "the same offer in effect" as one already in the
// library. Vendors resend, forwarders forward, and Make retries, so the same
// promotion arrives worded slightly differently more than once.
//
// v4 changes (Nov 2026):
//  - Two offers that both have no end date now count as agreeing on dates.
//    Before, a missing end date capped every score at 80%, so identical offers
//    with no deadline showed up as 74% or 76% matches.
//  - Wording is compared on the supplier's own text (full_details) as well as
//    the AI summary, and the higher of the two counts. The summary is rewritten
//    on every run; the supplier text is not.
//  - A pair needs at least MIN_TEXT_OVERLAP shared wording to be a match at all.
//    Same vendor and same deadline alone used to reach 58%, which flagged
//    different promotions from one supplier as repeats.
//  - Different named properties (two different hotels) are never a match.
//
// What happens with a score is decided by the caller using the thresholds in
// app_settings: at or above the merge threshold it merges automatically,
// between DUPLICATE_THRESHOLD and that it waits in Pending Review.

export { vendorKey, vendorsMatch } from './vendors';
import { vendorsMatch } from './vendors';

// The columns any caller must load for library rows so the scorer can work.
export const LIBRARY_COLUMNS =
  'id, status, vendor, supplier_type, offer_start_date, offer_end_date, offer_overview, full_details, properties';

// Common words in offer copy that carry no signal about which offer it is.
const TEXT_NOISE = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'from',
  'by', 'at', 'as', 'is', 'are', 'be', 'this', 'that', 'these', 'those',
  'up', 'off', 'per', 'plus', 'all', 'select', 'selected', 'new', 'now',
  'offer', 'offers', 'save', 'savings', 'book', 'booking', 'when', 'you', 'your',
  'our', 'we', 'will', 'can', 'more', 'please', 'contact', 'information'
]);

function words(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9%$]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

// Treats a missing start as "already running" and a missing end as "no end".
export function windowsOverlap(a, b) {
  const startA = a.offer_start_date || '0000-01-01';
  const endA = a.offer_end_date || '9999-12-31';
  const startB = b.offer_start_date || '0000-01-01';
  const endB = b.offer_end_date || '9999-12-31';
  return startA <= endB && startB <= endA;
}

// Overlap of meaningful words, measured against the shorter text so that a
// short summary of a long one still scores high.
export function textOverlap(a, b) {
  const setA = new Set(words(a).filter(w => !TEXT_NOISE.has(w) && w.length > 2));
  const setB = new Set(words(b).filter(w => !TEXT_NOISE.has(w) && w.length > 2));
  if (!setA.size || !setB.size) return 0;
  let shared = 0;
  for (const w of setA) if (setB.has(w)) shared += 1;
  return shared / Math.min(setA.size, setB.size);
}

function normName(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// True when both offers name specific properties and none of them overlap,
// e.g. a Hamburg hotel and a Mt. Fuji hotel from the same wholesaler sale.
export function propertiesDiffer(a, b) {
  const pa = (a.properties || []).map(normName).filter(Boolean);
  const pb = (b.properties || []).map(normName).filter(Boolean);
  if (!pa.length || !pb.length) return false;
  return !pa.some(x => pb.some(y => x === y || x.includes(y) || y.includes(x)));
}

// Below this much shared wording, two offers are not considered the same
// promotion however much else they share.
export const MIN_TEXT_OVERLAP = 0.5;

// Score at or above which an offer is held for a person to look at. Scores at
// or above the merge threshold in app_settings merge on their own instead.
export const DUPLICATE_THRESHOLD = 0.62;

// Returns null when the two are not plausibly the same offer, otherwise a
// score with the human-readable signals behind it.
export function scoreDuplicate(incoming, existing) {
  if (!vendorsMatch(incoming.vendor, existing.vendor)) return null;
  if (!windowsOverlap(incoming, existing)) return null;
  if (propertiesDiffer(incoming, existing)) return null;

  const overlap = Math.max(
    textOverlap(incoming.offer_overview, existing.offer_overview),
    textOverlap(incoming.full_details, existing.full_details)
  );
  if (overlap < MIN_TEXT_OVERLAP) return null;

  const signals = ['same vendor'];
  let score = 0.3;

  const endA = incoming.offer_end_date || null;
  const endB = existing.offer_end_date || null;
  if (endA === endB) {
    score += 0.2;
    signals.push(endA ? 'same end date' : 'neither has an end date');
  } else if (!endA || !endB) {
    score += 0.1;
    signals.push('one has no end date');
  } else {
    signals.push('overlapping dates');
  }

  if (incoming.supplier_type && incoming.supplier_type === existing.supplier_type) {
    score += 0.08;
    signals.push('same supplier type');
  }

  score += overlap * 0.42;
  if (overlap >= 0.75) signals.push('near-identical wording');
  else signals.push('similar wording');

  const rounded = Math.round(Math.min(score, 1) * 100) / 100;
  return { score: rounded, overlap: Math.round(overlap * 100) / 100, signals };
}

// Best match for one incoming offer among the offers already in the library.
// minScore defaults to the review threshold.
export function findDuplicate(incoming, existingOffers, minScore = DUPLICATE_THRESHOLD) {
  let best = null;
  for (const existing of existingOffers || []) {
    if (!existing || existing.id === incoming.id) continue;
    const result = scoreDuplicate(incoming, existing);
    if (result && (!best || result.score > best.score)) {
      best = { ...result, id: existing.id, vendor: existing.vendor, status: existing.status };
    }
  }
  return best && best.score >= minScore ? best : null;
}
