// apps/web/src/app/api/auth/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { readEnvVars } from '@/lib/env-file';
import { createSessionToken, getSessionSecret } from '@/lib/session';

// Simple in-memory rate limit: max 10 failed attempts per 15 min per client IP
const failedAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const now = Date.now();
  const entry = failedAttempts.get(ip);

  if (entry && entry.resetAt > now && entry.count >= MAX_ATTEMPTS) {
    return NextResponse.json(
      { error: { code: 'RATE_LIMITED', message: 'Too many failed login attempts. Try again later.' } },
      { status: 429 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as { password?: string };
  const envVars = readEnvVars();
  const expected = process.env.APP_PASSWORD || envVars.APP_PASSWORD || 'change-me';

  if (!body.password || body.password !== expected) {
    const nextCount = entry && entry.resetAt > now ? entry.count + 1 : 1;
    failedAttempts.set(ip, { count: nextCount, resetAt: now + WINDOW_MS });
    return NextResponse.json(
      { error: { code: 'INVALID_PASSWORD', message: 'Invalid password' } },
      { status: 401 }
    );
  }

  failedAttempts.delete(ip);

  const secret = getSessionSecret(envVars.SESSION_SECRET);
  const token = await createSessionToken(secret);

  const cookieStore = await cookies();
  cookieStore.set('studio_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  });

  return NextResponse.json({ success: true });
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete('studio_session');
  return NextResponse.json({ success: true });
}
