import { NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { createServerClient } from '@supabase/ssr'

// Routes that require admin role
const ADMIN_ROUTES = ['/history', '/users']

export async function middleware(request: NextRequest) {
  const { supabaseResponse, user } = await updateSession(request)
  const pathname = request.nextUrl.pathname

  // Not logged in — redirect to login (skip login page itself)
  if (!user && pathname !== '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(url)
  }

  // Logged in but hitting /login — redirect home
  if (user && pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  if (user) {
    // Check is_active — deactivated users are signed out immediately
    // Build a one-off client using the cookies from the response (session already refreshed)
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: () => {},
        },
      }
    )
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_active')
      .eq('id', user.id)
      .single()

    // If profile is null (row not yet created), allow through — the trigger may be racing.
    // If is_active is explicitly false, deactivate the session immediately.
    if (profile && profile.is_active === false) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('error', 'account_deactivated')
      const response = NextResponse.redirect(url)
      // Cookie name format: sb-{project-ref}-auth-token (project ref: uicbuzmduirdbeehygrg)
      response.cookies.delete('sb-uicbuzmduirdbeehygrg-auth-token')
      return response
    }

    // Role-based route protection — read role from JWT (no extra DB query)
    if (ADMIN_ROUTES.some(r => pathname.startsWith(r))) {
      const role = user.app_metadata?.role
      if (role !== 'admin') {
        const url = request.nextUrl.clone()
        url.pathname = '/'
        return NextResponse.redirect(url)
      }
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
