'use client';

import { useState } from 'react';

export default function AdminLogin() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    if (res.ok) {
      window.location.href = '/admin';
    } else {
      setError('Incorrect password');
      setLoading(false);
    }
  }

  return (
    <main className="main">
      <div className="container">
        <div className="login-card">
          <h2>Admin Access</h2>
          <form onSubmit={submit}>
            {error && <div className="login-error">{error}</div>}
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              autoFocus
              required
            />
            <button type="submit" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
          </form>
        </div>
      </div>
    </main>
  );
}
