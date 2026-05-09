import { NextResponse } from 'next/server';
import { createSessionCookie } from '../../../../lib/auth';

export async function POST(req) {
  const { password } = await req.json();
  if (password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.headers.set('Set-Cookie', createSessionCookie());
  return res;
}
