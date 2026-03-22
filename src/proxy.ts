import { NextRequest, NextResponse } from 'next/server';

export async function proxy(request: NextRequest) {
  const isAuth         = !!request.cookies.get('bress-auth')?.value;
  const hasOnboarding  = !!request.cookies.get('bress-onboarding')?.value;
  const { pathname }   = request.nextUrl;

  // Nie zalogowany → chroń dashboard i onboarding
  if (!isAuth && pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  if (!isAuth && pathname === '/onboarding') {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Zalogowany, onboarding niezakończony → wymuś onboarding
  if (isAuth && !hasOnboarding && pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/onboarding', request.url));
  }

  // Onboarding zakończony → nie pozwól wrócić do /onboarding
  if (isAuth && hasOnboarding && pathname === '/onboarding') {
    return NextResponse.redirect(new URL('/dashboard/chat', request.url));
  }

  // Zalogowany → skip login/register
  if ((pathname === '/login' || pathname === '/register') && isAuth) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/login', '/register', '/onboarding'],
};
