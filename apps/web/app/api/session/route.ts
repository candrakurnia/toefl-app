import { NextResponse } from 'next/server';

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set('refresh_token', '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return response;
}
