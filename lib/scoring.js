// Confidence that an extracted offer is right, worked out in code from checks
// that can be verified. The AI's own opinion of itself is only a small part.
//
// The admin slider (app_settings.publish_threshold) is compared against this
// number. Hard requirements below apply at any slider setting.

export const DEFAULT_SETTINGS = { publish_threshold: 75, merge_threshold: 90 };

export const WEIGHTS = {
  benefit_verified: 40,   // the benefit sentence appears word for word in the email
  vendor_known: 15,       // vendor already has a contact on file or offers in the library
  date_booking: 25,       // end date came from a booking deadline
  date_travel: 25,        // end date came from the last travel date
  date_estimated: 15,     // no date found, received + 60 days
  date_verified: 10,      // the date sentence appears word for word in the email
  certainty_high: 10,
  certainty_medium: 5,
  contact_conflict: -10
};

// Lowercase, letters and digits only, single spaces. Lets a quote match the
// email even when the email has odd spacing, line breaks or HTML entities.
export function normalizeText(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function quoteInEmail(quote, normalizedEmail) {
  const q = normalizeText(quote);
  if (q.length < 8 || !normalizedEmail) return false;
  if (normalizedEmail.includes(q)) return true;
  // Long quotes: accept when the first and last 40 characters both appear,
  // which survives the AI trimming a word in the middle.
  if (q.length > 100) {
    return normalizedEmail.includes(q.slice(0, 40)) && normalizedEmail.includes(q.slice(-40));
  }
  return false;
}

// rec: the record about to be saved, with evidence and end_date_source set.
// Returns { score, checks: [{ label, points }], benefitVerified }.
export function scoreConfidence(rec, { normalizedEmail, vendorKnown }) {
  const checks = [];
  const add = (label, points) => checks.push({ label, points });

  const evidence = rec.evidence || {};
  const benefitVerified = quoteInEmail(evidence.benefit_quote, normalizedEmail);
  add(benefitVerified ? 'Benefit found word for word in the email' : 'Benefit not found word for word in the email',
    benefitVerified ? WEIGHTS.benefit_verified : 0);

  add(vendorKnown ? 'Known vendor' : 'New vendor', vendorKnown ? WEIGHTS.vendor_known : 0);

  if (rec.end_date_source === 'booking_deadline') add('End date is the booking deadline', WEIGHTS.date_booking);
  else if (rec.end_date_source === 'travel_end') add('End date is the last travel date', WEIGHTS.date_travel);
  else add('End date estimated (60 days)', WEIGHTS.date_estimated);

  if (rec.end_date_source !== 'estimated') {
    const dateVerified = quoteInEmail(evidence.date_quote, normalizedEmail);
    add(dateVerified ? 'Date found word for word in the email' : 'Date not found word for word', dateVerified ? WEIGHTS.date_verified : 0);
  }

  const certainty = String(rec.kind_certainty || '').toLowerCase();
  if (certainty === 'high') add('AI sure this is an offer', WEIGHTS.certainty_high);
  else if (certainty === 'medium') add('AI fairly sure this is an offer', WEIGHTS.certainty_medium);
  else add('AI unsure this is an offer', 0);

  if (rec.contact_conflict) add('Contact differs from the one on file', WEIGHTS.contact_conflict);

  const score = Math.max(0, Math.min(100, checks.reduce((t, c) => t + c.points, 0)));
  return { score, checks, benefitVerified };
}

// Things that hold an offer for review at any slider setting.
export function hardHolds(rec, { isInternal, benefitVerified }) {
  const holds = [];
  if (!isInternal) holds.push('sent from outside MVT');
  if (!rec.vendor) holds.push('no vendor');
  if (!rec.offer_overview) holds.push('no overview');
  if (!benefitVerified) holds.push('benefit could not be found in the email');
  return holds;
}

export function normalizeSettings(row) {
  const out = { ...DEFAULT_SETTINGS };
  if (row && typeof row === 'object') {
    for (const k of Object.keys(DEFAULT_SETTINGS)) {
      const v = Number(row[k]);
      if (Number.isFinite(v) && v >= 0 && v <= 100) out[k] = Math.round(v);
    }
  }
  return out;
}
