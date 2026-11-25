// Folding a repeat offer into the one already in the library. Shared by the
// ingest route (automatic merges), the Merge button and bulk merge, so all
// three behave the same.

// Fields a merge carries over from the incoming offer onto the existing one.
// Excludes id, created_at and pinned so the existing offer keeps its link, its
// place in the list, and whether it is featured.
export const MERGE_FIELDS = [
  'vendor', 'supplier_type', 'audience', 'offer_start_date', 'offer_end_date', 'end_date_source',
  'travel_start_window', 'travel_end_window', 'book_through', 'voyage_list',
  'offer_details', 'client_facing_content', 'contact', 'offer_overview', 'full_details'
];

// Columns saved before a merge so Undo can put the existing offer back.
export const SNAPSHOT_FIELDS = [...MERGE_FIELDS, 'attachment_urls', 'tags', 'properties', 'status'];

function isEmpty(value) {
  return value === null || value === undefined || String(value).trim() === '';
}

export function union(a, b) {
  const merged = [...(a || []), ...(b || [])]
    .map(v => (typeof v === 'string' ? v.trim() : v))
    .filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const v of merged) {
    const key = String(v).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out.length ? out : null;
}

// The update to apply to `target` so it absorbs `incoming`.
export function buildMergeUpdate(target, incoming) {
  const update = {};
  for (const field of MERGE_FIELDS) {
    if (!isEmpty(incoming[field])) update[field] = incoming[field];
  }
  // An estimated date never overwrites a real one already on the offer.
  if (incoming.end_date_source === 'estimated' && target.offer_end_date && target.end_date_source !== 'estimated') {
    delete update.offer_end_date;
    delete update.end_date_source;
  }
  // Attachments, tags and properties accumulate rather than replace: a
  // follow-up email usually adds a flyer, it does not retract the previous one.
  const att = union(target.attachment_urls, incoming.attachment_urls);
  if (att) update.attachment_urls = att;
  const tags = union(target.tags, incoming.tags);
  if (tags) update.tags = tags;
  const props = union(target.properties, incoming.properties);
  if (props) update.properties = props;
  return update;
}

export function snapshot(row) {
  const out = {};
  for (const f of SNAPSHOT_FIELDS) out[f] = row[f] === undefined ? null : row[f];
  return out;
}
