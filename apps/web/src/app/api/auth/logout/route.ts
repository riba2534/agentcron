import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_CONFIG } from '@/server/trpc/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL('/login', req.url);
  const res = NextResponse.redirect(url);
  res.cookies.set(SESSION_CONFIG.cookieName, '', {
    path: '/',
    maxAge: 0,
    httpOnly: true,
    sameSite: 'lax',
  });
  return res;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return GET(req);
}
