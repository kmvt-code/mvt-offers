'use client';

import { useState, useEffect } from 'react';

function formatRelative(timestamp) {
  const then = new Date(timestamp).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 30) return 'just now';
  if (minutes < 1) return `${seconds} seconds ago`;
  if (minutes === 1) return '1 minute ago';
  if (minutes < 60) return `${minutes} minutes ago`;
  if (hours === 1) return '1 hour ago';
  if (hours < 24) return `${hours} hours ago`;
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;

  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatAbsolute(timestamp) {
  return new Date(timestamp).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit'
  });
}

export default function LastUpdated({ timestamp }) {
  // Use null initial state to render an empty placeholder on the server,
  // then compute the relative time on the client only. This avoids React
  // hydration mismatch warnings caused by server vs client time differences.
  const [relative, setRelative] = useState(null);

  useEffect(() => {
    setRelative(formatRelative(timestamp));
    const interval = setInterval(() => {
      setRelative(formatRelative(timestamp));
    }, 30000);
    return () => clearInterval(interval);
  }, [timestamp]);

  return (
    <div className="last-updated" title={relative ? formatAbsolute(timestamp) : ''}>
      <span className="last-updated-dot" />
      <span className="last-updated-label">Last update</span>
      <span className="last-updated-time">{relative || '\u00A0'}</span>
    </div>
  );
}
