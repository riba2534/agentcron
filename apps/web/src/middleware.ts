import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED_PREFIXES = ['/tasks', '/settings', '/clarify'];
const PUBLIC_API_PREFIXES = [
  '/api/trpc/auth.login',
  '/api/trpc/auth.register',
  '/api/auth/logout',
];

function needsAuth(pathname: string): boolean {
  if (pathname.startsWith('/login') || pathname.startsWith('/register')) return false;
  if (pathname.startsWith('/_next')) return false;
  if (pathname.startsWith('/api/trpc')) {
    return !PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p));
  }
  if (pathname.startsWith('/api/sse')) return true;
  return PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
}

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  if (!needsAuth(pathname)) return NextResponse.next();

  const cookie = req.cookies.get('cct_session');
  if (cookie?.value && cookie.value.length > 10) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: 'CCT_AUTH_SESSION_MISSING' },
      { status: 401 },
    );
  }

  const url = new URL('/login', req.url);
  url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    '/tasks/:path*',
    '/settings/:path*',
    '/clarify/:path*',
    '/api/sse/:path*',
  ],
};
