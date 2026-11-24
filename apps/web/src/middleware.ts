// apps/web/src/middleware.ts
// Enforces owner session authentication across all dashboard pages and /api/* endpoints.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSessionSecret, verifySessionToken } from '@/lib/session';

const PUBLIC_PATHS = ['/login', '/api/auth', '/api/health'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get('studio_session')?.value;
  const secret = getSessionSecret();
  const valid = await verifySessionToken(token, secret);

  if (valid) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Owner session required. Please log in.' } },
      { status: 401 }
    );
  }

  const loginUrl = new URL('/login', req.url);
  loginUrl.searchParams.set('next', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
