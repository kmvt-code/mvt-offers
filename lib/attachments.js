// Which uploaded files belong on an offer.
//
// Decision (Nov 2026): only PDFs and documents. Every image is dropped, which
// takes care of forwarder signature images (Chris's Outlook-xxxx.png, image001
// logos) and inline banner photos alike. Make filters these out before they are
// uploaded; this is the second line of defence for anything that slips past.

const DOCUMENT_EXTENSIONS = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'csv', 'txt', 'rtf', 'key', 'pages', 'zip'];

function extension(url) {
  const clean = String(url || '').split(/[?#]/)[0];
  const m = clean.match(/\.([a-z0-9]{2,5})$/i);
  return m ? m[1].toLowerCase() : '';
}

export function isDocumentUrl(url) {
  return DOCUMENT_EXTENSIONS.includes(extension(url));
}

// Accepts an array, a single URL, or a newline/comma separated string.
export function documentAttachments(input) {
  let list = input;
  if (!list) return [];
  if (typeof list === 'string') list = list.split(/[\n,]+/);
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const url = String(raw || '').trim();
    if (!url || !/^https?:\/\//i.test(url) || !isDocumentUrl(url)) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}
