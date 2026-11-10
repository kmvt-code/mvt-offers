// Site-wide notice shown above the offer list. Server-rendered and plain:
// email addresses and links in the message become clickable, nothing else is
// interpreted, so a message can never inject markup.

const TOKEN = /([\w.+-]+@[\w-]+(?:\.[\w-]+)+|https?:\/\/[^\s<]+)/g;

function linkify(text) {
  const parts = String(text).split(TOKEN);
  return parts.map((part, i) => {
    if (i % 2 === 0) return part;
    // A sentence often ends right after a link. Keep that period outside it.
    const trail = /[.,;:!?)]+$/.exec(part)?.[0] || '';
    const core = trail ? part.slice(0, -trail.length) : part;
    const href = core.includes('@') && !core.startsWith('http') ? `mailto:${core}` : core;
    return (
      <span key={i}>
        <a href={href} className="announcement-link" target={href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer">{core}</a>
        {trail}
      </span>
    );
  });
}

export default function Announcement({ message }) {
  if (!message) return null;
  return (
    <div className="announcement" role="status">
      <div className="container announcement-inner">
        <span className="announcement-label">Notice</span>
        <p className="announcement-text">{linkify(message)}</p>
      </div>
    </div>
  );
}
