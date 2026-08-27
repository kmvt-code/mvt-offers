// Detecting offers that are "the same offer in effect" as one already in the
// library. Vendors resend, forwarders forward, and Make retries, so the same
// promotion arrives worded slightly differently more than once.
//
// This scores a candidate pair. It never decides anything on its own: a strong
// score routes the incoming offer to Pending Review with the match recorded, and
// a person chooses merge, keep both, or discard.

// Words that appear in a vendor's name without distinguishing it. "Silversea"
// and "Silversea Cruises" are one vendor; so are "Avalon Waterways" and
// "Avalon Waterways River Cruises".
const VENDOR_NOISE = new Set([
  'cruise', 'cruises', 'cruiseline', 'cruivelines', 'cruiselines', 'line', 'lines',
  'river', 'yacht', 'yachts', 'collection', 'expeditions', 'expedition',
  'tour', 'tours', 'travel', 'vacations', 'holidays', 'journeys',
  'hotel', 'hotels', 'resort', 'resorts', 'inn', 'lodge',
  'the', 'and', 'group', 'company', 'co', 'inc', 'llc', 'ltd', 'usa', 'international'
]);

// Common words in offer copy that carry no signal about which offer it is.
const TEXT_NOISE = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'from',
  'by', 'at', 'as', 'is', 'are', 'be', 'this', 'that', 'these', 'those',
  'up', 'off', 'per', 'plus', 'all', 'select', 'selected', 'new', 'now',
  'offer', 'offers', 'save', 'savings', 'book', 'booking', 'when', 'you', 'your'
]);

function words(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9%$]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

// The distinguishing part of a vendor name, e.g. "Silversea Cruises" -> "silversea".
// Falls back to the full stripped name when every word is noise, so a vendor
// literally called "The Travel Company" still gets a key.
export function vendorKey(vendor) {
  const all = words(vendor);
  const meaningful = all.filter(w => !VENDOR_NOISE.has(w));
  return (meaningful.length ? meaningful : all).join('');
}

export function vendorsMatch(a, b) {
  const ka = vendorKey(a);
  const kb = vendorKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  // One name being a longer form of the other, e.g. "silversea" / "silverseasilver".
  const [shortKey, longKey] = ka.length <= kb.length ? [ka, kb] : [kb, ka];
  return shortKey.length >= 5 && longKey.startsWith(shortKey);
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

// Score above which an offer is held for review. Deliberately set so that a
// near-certain repeat is caught and a merely similar promotion is not.
export const DUPLICATE_THRESHOLD = 0.62;

// Returns null when the two are not plausibly the same offer, otherwise a
// score with the human-readable signals behind it.
export function scoreDuplicate(incoming, existing) {
  if (!vendorsMatch(incoming.vendor, existing.vendor)) return null;
  if (!windowsOverlap(incoming, existing)) return null;

  const signals = ['same vendor'];
  let score = 0.3;

  if (incoming.offer_end_date && incoming.offer_end_date === existing.offer_end_date) {
    score += 0.2;
    signals.push('same end date');
  } else {
    signals.push('overlapping dates');
  }

  if (incoming.supplier_type && incoming.supplier_type === existing.supplier_type) {
    score += 0.08;
    signals.push('same supplier type');
  }

  const overlap = textOverlap(incoming.offer_overview, existing.offer_overview);
  score += overlap * 0.42;
  if (overlap >= 0.75) signals.push('near-identical wording');
  else if (overlap >= 0.45) signals.push('similar wording');

  const rounded = Math.round(Math.min(score, 1) * 100) / 100;
  return { score: rounded, overlap: Math.round(overlap * 100) / 100, signals };
}

// Best match for one incoming offer among the offers already in the library.
export function findDuplicate(incoming, existingOffers) {
  let best = null;
  for (const existing of existingOffers || []) {
    if (!existing || existing.id === incoming.id) continue;
    const result = scoreDuplicate(incoming, existing);
    if (result && (!best || result.score > best.score)) {
      best = { ...result, id: existing.id, vendor: existing.vendor };
    }
  }
  return best && best.score >= DUPLICATE_THRESHOLD ? best : null;
}
