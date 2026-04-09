import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;

  // Always allow auth API routes through
  if (pathname.startsWith("/api/auth")) return NextResponse.next();

  // Redirect unauthenticated users to login
  if (!isLoggedIn && pathname !== "/login") {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Redirect authenticated users away from login page
  if (isLoggedIn && pathname === "/login") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|public).*)"],
};
