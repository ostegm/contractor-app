import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  // Since the backend is down, we'll bypass all authentication
  // and only allow access to the homepage and static assets
  
  const pathname = request.nextUrl.pathname
  
  // Allow access to the homepage and static files
  if (pathname === '/' || pathname.startsWith('/_next') || pathname.includes('.')) {
    return NextResponse.next()
  }
  
  // Redirect all other routes to the homepage
  return NextResponse.redirect(new URL('/', request.url))
} 