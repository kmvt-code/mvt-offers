// One definition of vendor identity for the whole app.
//
// "Silversea" and "Silversea Cruises" are one vendor. Until now the app held two
// contradictory answers to that question: the duplicate matcher stripped noise
// words and said yes, while the contact memory compared punctuation-stripped
// names and said no. So an offer arriving under the longer name would not find
// the contact already on file, and a second vendor_contacts row would be created
// beside the first.

// Words that appear in a vendor's name without distinguishing it.
const VENDOR_NOISE = new Set([
  'cruise', 'cruises', 'cruiseline', 'cruivelines', 'cruiselines', 'line', 'lines',
  'river', 'yacht', 'yachts', 'collection', 'expeditions', 'expedition',
  'tour', 'tours', 'travel', 'vacations', 'holidays', 'journeys',
  'hotel', 'hotels', 'resort', 'resorts', 'inn', 'lodge',
  'the', 'and', 'group', 'company', 'co', 'inc', 'llc', 'ltd', 'usa', 'international'
]);

function words(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

// The storage key for vendor_contacts. Kept exactly as it was so existing rows
// stay addressable and no migration is needed; variant matching happens at
// lookup time instead, in vendorsMatch.
export function normalizeVendor(v) {
  if (!v) return '';
  return String(v).toLowerCase().replace(/[^a-z0-9]/g, '');
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
  // One name being a longer form of the other, e.g. "abercrombie" / "abercrombiekent".
  const [shortKey, longKey] = ka.length <= kb.length ? [ka, kb] : [kb, ka];
  return shortKey.length >= 5 && longKey.startsWith(shortKey);
}

// The vendor_contacts row for this vendor, allowing for name variants.
// An exact key match always wins, so nothing that worked before changes
// behaviour. Only when there is no exact row does the looser match apply.
export function findVendorContact(vendor, rows) {
  if (!vendor) return null;
  const list = rows || [];
  const key = normalizeVendor(vendor);
  const exact = list.find(r => r && r.vendor_normalized === key);
  if (exact) return exact;
  return list.find(r => r && vendorsMatch(vendor, r.vendor_display)) || null;
}
