# Supabase Integration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace NextAuth + local file storage with Supabase Auth, add role-based access control (admin/user), migrate the client list, add user management, and wire report history with Supabase Storage.

**Architecture:** Supabase Auth handles all authentication via email/password with JWT-embedded role claims. `@supabase/ssr` manages cookie-based sessions in Next.js App Router. A session-aware Supabase client is created per-request in all server code so RLS policies fire correctly; a separate admin client (service role) is used only for user invite and storage upload operations. Deactivated users are checked in middleware and rejected before any route is served.

**Tech Stack:** Next.js 16 (App Router), Supabase (Auth + Postgres + Storage), `@supabase/ssr`, `@supabase/supabase-js`, `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`, TypeScript

**Spec:** `docs/superpowers/specs/2026-04-29-supabase-integration-design.md`

---

## Chunk 1: Foundation — Packages, Env, Supabase Clients, Middleware, Login

> **Ordering note:** The login form rewrite and NextAuth removal happen in this chunk — together — so there is never a gap where the app has no working login path.

### Task 1: Install new packages and remove NextAuth

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install Supabase SSR and dnd-kit packages**

```bash
cd nrt-ap-aging-dashboard
npm install @supabase/ssr @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

Expected output: packages added to `node_modules`, `package.json` updated with new dependencies.

- [ ] **Step 2: Remove NextAuth and nodemailer**

```bash
npm uninstall next-auth nodemailer
```

Expected output: `next-auth` and `nodemailer` removed from `package.json` and `node_modules`.

- [ ] **Step 3: Verify TypeScript still compiles (expect errors — that is fine here, just checking the toolchain)**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: TypeScript errors about missing `next-auth` imports — expected since we have not removed the files yet.

---

### Task 2: Update `.env.local` with Supabase credentials

**Files:**
- Modify: `.env.local`

- [ ] **Step 1: Replace `.env.local` contents**

Replace the entire `.env.local` file with:

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://uicbuzmduirdbeehygrg.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpY2J1em1kdWlyZGJlZWh5Z3JnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0Nzk4NTIsImV4cCI6MjA5MzA1NTg1Mn0.58nS4SwbZeaiuTmJM3yW6xguuZc-xkua97O30ARFXq0
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpY2J1em1kdWlyZGJlZWh5Z3JnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzQ3OTg1MiwiZXhwIjoyMDkzMDU1ODUyfQ.7Tuaw-hPixAEGAl7yrDdyj9xZWxVBUBtediazDOWqNw

# Application
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

> **Note:** `SUPABASE_SERVICE_ROLE_KEY` is server-only. Never import it from client components. Only `lib/supabase/admin.ts` should reference it.

---

### Task 3: Create Supabase client files

**Files:**
- Create: `lib/supabase/client.ts`
- Rewrite: `lib/supabase/server.ts`
- Create: `lib/supabase/admin.ts`
- Create: `lib/supabase/middleware.ts`

- [ ] **Step 1: Create browser-side client — `lib/supabase/client.ts`**

```typescript
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './database.types'

export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 2: Rewrite server-side client — `lib/supabase/server.ts`**

Replace the entire file. The function is `async` because `cookies()` is async in Next.js 16.

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from './database.types'

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component — safe to ignore, middleware handles refresh
          }
        },
      },
    }
  )
}
```

- [ ] **Step 3: Update the four API routes that still import `supabaseServer` (the old singleton)**

These files currently import the old singleton from `lib/supabase/server.ts`. Update them now — at the same time as the rewrite — to prevent TypeScript/runtime errors.

In **`app/api/clients/route.ts`**, **`app/api/clients/[id]/route.ts`**, **`app/api/parse-files/route.ts`**, and **`app/api/reports/route.ts`**, replace every occurrence of:

```typescript
import { supabaseServer } from "@/lib/supabase/server";
// ... usage like:
supabaseServer.from(...)
```

with:

```typescript
import { createSupabaseServerClient } from "@/lib/supabase/server";
// ... usage like:
const supabase = await createSupabaseServerClient();
supabase.from(...)
```

These four files will be fully rewritten in later tasks — this step only swaps the import/instantiation pattern so the project compiles right now.

- [ ] **Step 4: Create admin client — `lib/supabase/admin.ts`**

```typescript
import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

// Service role client — bypasses RLS. Only use for:
//   - auth.admin.inviteUserByEmail()
//   - auth.admin.updateUserById() (role changes)
//   - Storage uploads from the report export flow
// Never import this in client components or pages.
export function createSupabaseAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
```

- [ ] **Step 5: Create middleware session helper — `lib/supabase/middleware.ts`**

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: Do not add any logic between createServerClient and getUser()
  const { data: { user } } = await supabase.auth.getUser()

  return { supabaseResponse, user }
}
```

- [ ] **Step 6: Verify TypeScript on lib/supabase files**

```bash
npx tsc --noEmit 2>&1 | grep "lib/supabase"
```

Expected: No errors.

---

### Task 4: Create `middleware.ts` at project root (with `is_active` check)

**Files:**
- Create: `middleware.ts` (project root, same level as `package.json`)

> **`is_active` enforcement:** The spec requires that deactivated users are rejected at the API layer. The middleware is the cleanest single enforcement point. After confirming the user has a valid session, the middleware fetches their profile to check `is_active`. A deactivated user is signed out and redirected to `/login` before any route handler runs.

- [ ] **Step 1: Write `middleware.ts`**

```typescript
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

    if (profile && profile.is_active === false) {
      // Sign out and redirect to login with a message
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('error', 'account_deactivated')
      const response = NextResponse.redirect(url)
      // Clear the auth cookie
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
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "middleware"
```

Expected: No errors for `middleware.ts`.

---

### Task 5: Rewrite login form for Supabase Auth

**Files:**
- Rewrite: `components/auth/login-form.tsx`

> **Do this BEFORE deleting NextAuth files (Task 6).** This ensures the login path is never broken.

- [ ] **Step 1: Rewrite `components/auth/login-form.tsx`**

Keep all existing visual styles exactly. Only the auth logic changes:

```typescript
"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const GOLD = "#B9965A";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";
  const accountError = searchParams.get("error") === "account_deactivated";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    accountError ? "Your account has been deactivated. Contact an admin." : null
  );
  const [isPending, startTransition] = useTransition();

  const handleCredentials = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const domain = email.split("@")[1]?.toLowerCase();
    if (domain !== "americanapartners.com" && domain !== "nonzeroai.com") {
      setError("Access is restricted to americanapartners.com and nonzeroai.com accounts.");
      return;
    }

    startTransition(async () => {
      const supabase = createSupabaseBrowserClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.toLowerCase().trim(),
        password,
      });

      if (authError) {
        setError("Invalid email or password.");
        return;
      }

      router.push(callbackUrl);
      router.refresh();
    });
  };

  return (
    <div style={styles.root}>
      <div style={styles.grid} aria-hidden />
      <div style={styles.glow} aria-hidden />
      <div style={styles.card}>
        <div style={styles.logoRow}>
          <div style={styles.logoMark}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill={GOLD} fillOpacity="0.15" />
              <path d="M16 4L28 10V22L16 28L4 22V10L16 4Z" stroke={GOLD} strokeWidth="1.5" fill="none" />
              <circle cx="16" cy="16" r="4" fill={GOLD} />
            </svg>
          </div>
          <div>
            <div style={styles.logoTitle}>Americana</div>
            <div style={styles.logoSub}>AP Aging Dashboard</div>
          </div>
        </div>

        <h1 style={styles.heading}>Sign in</h1>
        <p style={styles.subheading}>Use your Americana or NonZero AI account</p>

        {error && <div style={styles.errorBox}>{error}</div>}

        <form onSubmit={handleCredentials} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label} htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.input}
              placeholder="you@americanapartners.com"
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label} htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={styles.input}
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={isPending}
            style={{ ...styles.primaryBtn, opacity: isPending ? 0.7 : 1 }}
          >
            {isPending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#0a0a0a",
    position: "relative",
    overflow: "hidden",
    fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
  },
  grid: {
    position: "absolute",
    inset: 0,
    backgroundImage:
      "linear-gradient(rgba(185,150,90,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(185,150,90,0.06) 1px, transparent 1px)",
    backgroundSize: "48px 48px",
  },
  glow: {
    position: "absolute",
    top: "20%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: 600,
    height: 600,
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(185,150,90,0.08) 0%, transparent 70%)",
    pointerEvents: "none",
  },
  card: {
    position: "relative",
    zIndex: 1,
    width: "100%",
    maxWidth: 420,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(185,150,90,0.2)",
    borderRadius: 16,
    padding: "40px 36px",
    backdropFilter: "blur(8px)",
  },
  logoRow: { display: "flex", alignItems: "center", gap: 12, marginBottom: 28 },
  logoMark: { flexShrink: 0 },
  logoTitle: { color: "#fff", fontWeight: 700, fontSize: 16, fontFamily: "Georgia, serif", letterSpacing: "0.02em" },
  logoSub: { color: "rgba(255,255,255,0.4)", fontSize: 11, marginTop: 1 },
  heading: { color: "#fff", fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: "-0.01em" },
  subheading: { color: "rgba(255,255,255,0.4)", fontSize: 13, marginTop: 6, marginBottom: 24 },
  errorBox: {
    background: "rgba(239,68,68,0.1)",
    border: "1px solid rgba(239,68,68,0.3)",
    borderRadius: 8,
    color: "#fca5a5",
    fontSize: 13,
    padding: "10px 14px",
    marginBottom: 16,
  },
  form: { display: "flex", flexDirection: "column", gap: 16 },
  field: { display: "flex", flexDirection: "column", gap: 6 },
  label: { color: "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: 500 },
  input: {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 8,
    color: "#fff",
    fontSize: 14,
    padding: "10px 12px",
    outline: "none",
  },
  primaryBtn: {
    background: GOLD,
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontWeight: 600,
    fontSize: 14,
    padding: "11px 0",
    cursor: "pointer",
    marginTop: 4,
  },
};
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "login-form"
```

Expected: No errors.

---

### Task 6: Remove legacy NextAuth files

**Files:**
- Delete: `auth.ts`
- Delete: `app/api/auth/[...nextauth]/route.ts`
- Delete: `components/auth/session-provider.tsx`
- Modify: `app/layout.tsx`

> **This task runs AFTER Task 5** (login form already works via Supabase Auth at this point).

- [ ] **Step 1: Delete the three NextAuth files**

```bash
rm auth.ts
rm "app/api/auth/[...nextauth]/route.ts"
rmdir "app/api/auth/[...nextauth]" 2>/dev/null || true
rm components/auth/session-provider.tsx
```

- [ ] **Step 2: Remove AuthSessionProvider from `app/layout.tsx`**

Rewrite `app/layout.tsx` as:

```typescript
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AP Aging Dashboard",
  description: "AP Aging Detail Report Management System for Americana",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Verify TypeScript — zero NextAuth errors**

```bash
npx tsc --noEmit 2>&1 | grep -i "next-auth\|nextauth\|session-provider" | head -10
```

Expected: No output.

- [ ] **Step 4: Add sign-out server action — `app/actions/auth.ts`**

```typescript
"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
```

- [ ] **Step 5: Rewrite `components/layout/sidebar.tsx`**

```typescript
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { FileText, Users, History, LogOut, UserCog } from "lucide-react";
import { signOut } from "@/app/actions/auth";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const baseNavigation = [
  { name: "AP Aging Detail", href: "/", icon: FileText },
  { name: "Clients", href: "/clients", icon: Users },
];

const adminNavigation = [
  { name: "History", href: "/history", icon: History },
  { name: "Users", href: "/users", icon: UserCog },
];

export function Sidebar() {
  const pathname = usePathname();
  const [userInfo, setUserInfo] = useState<{ name: string; email: string; role: string } | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserInfo({
          name: user.user_metadata?.full_name ?? user.email?.split("@")[0] ?? "User",
          email: user.email ?? "",
          role: user.app_metadata?.role ?? "user",
        });
      }
    });
  }, []);

  const isAdmin = userInfo?.role === "admin";
  const navigation = isAdmin ? [...baseNavigation, ...adminNavigation] : baseNavigation;

  return (
    <div className="flex h-full w-64 flex-col border-r bg-card">
      <div className="flex h-16 items-center border-b px-6">
        <h1 className="text-xl font-bold text-foreground">Americana</h1>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.name}
            </Link>
          );
        })}
      </nav>
      <div className="border-t p-4">
        <div className="mb-3 px-2">
          <p className="text-sm font-medium text-foreground truncate">{userInfo?.name ?? "Loading…"}</p>
          <p className="text-xs text-muted-foreground truncate">{userInfo?.email ?? ""}</p>
          {isAdmin && (
            <span className="text-xs text-amber-600 font-medium">Admin</span>
          )}
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Verify full TypeScript pass for Chunk 1**

```bash
npx tsc --noEmit 2>&1
```

Expected: No errors.

- [ ] **Step 7: Commit Chunk 1**

```bash
git add -A
git commit -m "feat: add Supabase clients, middleware, login form, sidebar; remove NextAuth"
```

---

## Chunk 2: Database — Migrations and Schema

### Task 7: Delete old schema and run new migration 001

**Files:**
- Delete: `supabase/schema.sql`
- Create: `supabase/migrations/001_schema.sql`

> **Run migrations in the Supabase SQL Editor** at https://supabase.com/dashboard/project/uicbuzmduirdbeehygrg/sql/new — NOT via the CLI (not configured in this project).

- [ ] **Step 1: Delete `supabase/schema.sql`**

```bash
rm supabase/schema.sql
```

- [ ] **Step 2: Create `supabase/migrations/001_schema.sql`**

```sql
-- ============================================================
-- Migration 001: Full schema with profiles, RLS, triggers
-- Run in the Supabase SQL Editor
-- ============================================================

-- ── profiles ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  invited_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── clients ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  display_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── reports ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_name TEXT NOT NULL,
  report_date TEXT NOT NULL,
  file_url TEXT,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── report_files ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS report_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── indexes ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_clients_display_order ON clients(display_order);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_created_by ON reports(created_by);
CREATE INDEX IF NOT EXISTS idx_report_files_report_id ON report_files(report_id);

-- ── updated_at trigger ──────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER update_reports_updated_at
  BEFORE UPDATE ON reports FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── auto-create profile on user signup ──────────────────────
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_app_meta_data->>'role', 'user')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ── enable RLS ───────────────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_files ENABLE ROW LEVEL SECURITY;

-- Drop old permissive policies if they exist
DROP POLICY IF EXISTS "Allow all operations on clients" ON clients;
DROP POLICY IF EXISTS "Allow all operations on reports" ON reports;
DROP POLICY IF EXISTS "Allow all operations on report_files" ON report_files;

-- ── profiles RLS ─────────────────────────────────────────────
CREATE POLICY "Users read own profile"
  ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Admins read all profiles"
  ON profiles FOR SELECT
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');
CREATE POLICY "Admins update profiles"
  ON profiles FOR UPDATE
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- ── clients RLS ──────────────────────────────────────────────
CREATE POLICY "Authenticated read clients"
  ON clients FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admins insert clients"
  ON clients FOR INSERT
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') = 'admin');
CREATE POLICY "Admins update clients"
  ON clients FOR UPDATE
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');
CREATE POLICY "Admins delete clients"
  ON clients FOR DELETE
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- ── reports RLS ──────────────────────────────────────────────
CREATE POLICY "Users insert own reports"
  ON reports FOR INSERT
  WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Admins read all reports"
  ON reports FOR SELECT
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');
CREATE POLICY "Admins update reports"
  ON reports FOR UPDATE
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- ── report_files RLS ─────────────────────────────────────────
CREATE POLICY "Users insert report files"
  ON report_files FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins read report files"
  ON report_files FOR SELECT
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- ── Storage bucket + RLS ─────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('reports', 'reports', false)
ON CONFLICT DO NOTHING;

-- Storage objects RLS: only admins can read or write stored reports
CREATE POLICY "Admins full access to reports bucket"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'reports'
    AND (auth.jwt()->'app_metadata'->>'role') = 'admin'
  )
  WITH CHECK (
    bucket_id = 'reports'
    AND (auth.jwt()->'app_metadata'->>'role') = 'admin'
  );
```

> **Note on Storage uploads:** The report export flow uses the admin client (service role) to upload files, which bypasses RLS entirely. The Storage RLS policy above prevents non-admin users from reading or downloading stored files directly via the anon key.

- [ ] **Step 3: Run `001_schema.sql` in Supabase SQL Editor**

Navigate to https://supabase.com/dashboard/project/uicbuzmduirdbeehygrg/sql/new, paste the full contents, and click **Run**.

Expected: "Success. No rows returned."

- [ ] **Step 4: Verify tables exist**

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' ORDER BY table_name;
```

Expected rows: `clients`, `profiles`, `report_files`, `reports`

---

### Task 8: Seed clients (migration 002)

**Files:**
- Create: `supabase/migrations/002_seed_clients.sql`

- [ ] **Step 1: Create `supabase/migrations/002_seed_clients.sql`**

```sql
-- Migration 002: Seed 37 clients. Only runs if table is empty.
INSERT INTO clients (name, display_order)
SELECT name, display_order FROM (VALUES
  ('Dobson', 1), ('Creekside', 2), ('Pilot Mountain', 3), ('King', 4),
  ('Elkin', 5), ('East Bend', 6), ('JMS Brunswick', 7), ('JMS Holly Springs', 8),
  ('JMS Jensen Beach', 9), ('JMS Mooresville', 10), ('JMS Mooresville 2', 11),
  ('JMS Mooresville 3', 12), ('JMS Rural Hall', 13), ('JMS Salisbury', 14),
  ('Canton', 15), ('NWA Storage', 16), ('CJ Trust', 17), ('Hartland', 18),
  ('Kenosha', 19), ('Lakeland', 20), ('Madison', 21), ('1912 Walton', 22),
  ('8th St', 23), ('Airport', 24), ('Broyles', 25), ('Centerton', 26),
  ('Joyce', 27), ('Oak St', 28), ('Pleasant St 1', 29), ('Pleasant St 2', 30),
  ('Robinson', 31), ('Shady Grove', 32), ('Trafalgar', 33), ('Walton', 34),
  ('Fond du Lac', 35), ('Fond du Lac Business Savings', 36), ('Lakeside Truck Rentals', 37)
) AS v(name, display_order)
WHERE NOT EXISTS (SELECT 1 FROM clients LIMIT 1);
```

- [ ] **Step 2: Run `002_seed_clients.sql` in the SQL Editor**

Paste and run.

Expected: "Success. 37 rows affected."

- [ ] **Step 3: Verify client count**

```sql
SELECT COUNT(*), MIN(display_order), MAX(display_order) FROM clients;
```

Expected: `count=37, min=1, max=37`

- [ ] **Step 4: Commit Chunk 2**

```bash
git add -A
git commit -m "feat: add Supabase migration files — schema, RLS, Storage policies, client seed"
```

---

## Chunk 3: Client List — API Routes and Drag-and-Drop

### Task 9: Update types for Supabase alignment

**Files:**
- Modify: `lib/types/index.ts`

- [ ] **Step 1: Update `Report` type in `lib/types/index.ts`**

Add `created_by` and change `status` to `string` (matching the database) while keeping a type guard helper for the badge component:

```typescript
export interface Report {
  id: string;
  report_name: string;
  report_date: string;
  file_url: string | null;
  status: string;  // 'processing' | 'completed' | 'failed' — kept as string to match DB
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// Type guard used by components that need the status union
export function isReportStatus(s: string): s is 'processing' | 'completed' | 'failed' {
  return s === 'processing' || s === 'completed' || s === 'failed';
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "types/index"
```

Expected: No errors.

---

### Task 10: Remove legacy files and rewrite client API routes

**Files:**
- Delete: `lib/constants/clients.ts`
- Delete: `lib/local-store.ts`
- Rewrite: `app/api/clients/route.ts`
- Rewrite: `app/api/clients/[id]/route.ts`
- Create: `app/api/clients/reorder/route.ts`
- Rewrite: `app/api/parse-files/route.ts`

- [ ] **Step 1: Delete legacy files**

```bash
rm lib/constants/clients.ts
rm lib/local-store.ts
```

- [ ] **Step 2: Rewrite `app/api/clients/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .order("display_order", { ascending: true });
    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching clients:", error);
    return NextResponse.json({ error: "Failed to fetch clients" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.app_metadata?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { name } = await request.json() as { name: string };
    if (!name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const { data: max } = await supabase
      .from("clients")
      .select("display_order")
      .order("display_order", { ascending: false })
      .limit(1)
      .single();

    const display_order = (max?.display_order ?? 0) + 1;
    const { data, error } = await supabase
      .from("clients")
      .insert({ name: name.trim(), display_order })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error("Error creating client:", error);
    return NextResponse.json({ error: "Failed to create client" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Rewrite `app/api/clients/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function requireAdmin(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient();
    const denied = await requireAdmin(supabase);
    if (denied) return denied;

    const { id } = await params;
    const { name } = await request.json() as { name: string };
    if (!name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("clients")
      .update({ name: name.trim() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error updating client:", error);
    return NextResponse.json({ error: "Failed to update client" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient();
    const denied = await requireAdmin(supabase);
    if (denied) return denied;

    const { id } = await params;
    const { error } = await supabase.from("clients").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting client:", error);
    return NextResponse.json({ error: "Failed to delete client" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Create `app/api/clients/reorder/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.app_metadata?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { orderedIds } = await request.json() as { orderedIds: string[] };
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return NextResponse.json({ error: "orderedIds array required" }, { status: 400 });
    }

    const updates = orderedIds.map((id, index) => ({
      id,
      display_order: index + 1,
    }));

    const { error } = await supabase
      .from("clients")
      .upsert(updates, { onConflict: "id" });
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error reordering clients:", error);
    return NextResponse.json({ error: "Failed to reorder clients" }, { status: 500 });
  }
}
```

- [ ] **Step 5: Rewrite `app/api/parse-files/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { parseExcelFile } from "@/lib/excel/parser";
import { calculateTotals } from "@/lib/excel/processor";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();

    const formData = await request.formData();
    const files = formData.getAll("files") as File[];
    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("clients")
      .select("name")
      .order("display_order", { ascending: true });
    if (error) throw error;
    const masterCompanies = (data as { name: string }[]).map((c) => c.name);

    const allTransactions = [];
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      allTransactions.push(...parseExcelFile(buffer));
    }

    const processedData = calculateTotals(allTransactions, masterCompanies);

    return NextResponse.json({
      success: true,
      transactions: processedData.transactions,
      totalsByCompany: processedData.totalsByCompany,
    });
  } catch (error) {
    console.error("Error parsing files:", error);
    return NextResponse.json({ error: "Failed to parse files" }, { status: 500 });
  }
}
```

- [ ] **Step 6: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -E "local-store|constants/clients|api/clients"
```

Expected: No errors.

---

### Task 11: Add drag-and-drop reorder to ClientsTable

**Files:**
- Rewrite: `components/clients/clients-table.tsx`
- Modify: `app/clients/page.tsx`

- [ ] **Step 1: Rewrite `components/clients/clients-table.tsx`**

```typescript
"use client";

import { useState, useEffect } from "react";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Pencil, Trash2, GripVertical, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Client } from "@/lib/types";

function SortableRow({
  client, isAdmin, onEdit, onDelete,
}: {
  client: Client; isAdmin: boolean;
  onEdit: (c: Client) => void; onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: client.id, disabled: !isAdmin });

  return (
    <TableRow
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
    >
      <TableCell>
        {isAdmin && (
          <span {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </span>
        )}
      </TableCell>
      <TableCell className="font-medium">{client.display_order}</TableCell>
      <TableCell>{client.name}</TableCell>
      <TableCell className="text-right">
        {isAdmin && (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => onEdit(client)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onDelete(client.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}

export function ClientsTable({ isAdmin = false }: { isAdmin?: boolean }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [formName, setFormName] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => { fetchClients(); }, []);

  const fetchClients = async () => {
    try {
      const res = await fetch("/api/clients");
      if (!res.ok) throw new Error();
      setClients(await res.json());
    } catch { toast.error("Failed to load clients"); }
    finally { setIsLoading(false); }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = clients.findIndex((c) => c.id === active.id);
    const newIndex = clients.findIndex((c) => c.id === over.id);
    const reordered = arrayMove(clients, oldIndex, newIndex).map((c, i) => ({ ...c, display_order: i + 1 }));
    setClients(reordered);
    try {
      const res = await fetch("/api/clients/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: reordered.map((c) => c.id) }),
      });
      if (!res.ok) throw new Error();
      toast.success("Client order saved");
    } catch {
      toast.error("Failed to save order");
      fetchClients();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;
    setIsSaving(true);
    try {
      const url = editingClient ? `/api/clients/${editingClient.id}` : "/api/clients";
      const method = editingClient ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: formName.trim() }),
      });
      if (!res.ok) throw new Error();
      toast.success(editingClient ? "Client updated" : "Client added");
      setIsDialogOpen(false);
      setEditingClient(null);
      setFormName("");
      fetchClients();
    } catch { toast.error("Failed to save client"); }
    finally { setIsSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this client? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/clients/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Client deleted");
      fetchClients();
    } catch { toast.error("Failed to delete client"); }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Client List</CardTitle>
            <CardDescription>
              {isAdmin ? "Drag to reorder. Changes are applied globally." : "Clients and report display order."}
            </CardDescription>
          </div>
          {isAdmin && (
            <Button onClick={() => { setEditingClient(null); setFormName(""); setIsDialogOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" /> Add Client
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead className="w-16">Order</TableHead>
                <TableHead>Client Name</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <SortableContext items={clients.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                {clients.map((client) => (
                  <SortableRow
                    key={client.id}
                    client={client}
                    isAdmin={isAdmin}
                    onEdit={(c) => { setEditingClient(c); setFormName(c.name); setIsDialogOpen(true); }}
                    onDelete={handleDelete}
                  />
                ))}
              </SortableContext>
            </TableBody>
          </Table>
        </DndContext>
      </CardContent>

      {isAdmin && (
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent>
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>{editingClient ? "Edit Client" : "Add Client"}</DialogTitle>
                <DialogDescription>
                  {editingClient ? "Update client name." : "New client added at the bottom of the list."}
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <Label htmlFor="name">Client Name</Label>
                <Input
                  id="name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Enter client name"
                  required
                  className="mt-2"
                />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={isSaving}>
                  {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  {editingClient ? "Update" : "Add"} Client
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}
```

- [ ] **Step 2: Update `app/clients/page.tsx` to read role from server session**

```typescript
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ClientsTable } from "@/components/clients/clients-table";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ClientsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isAdmin = user?.app_metadata?.role === "admin";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Clients</h1>
          <p className="text-muted-foreground mt-2">
            {isAdmin ? "Manage your client list and display order for reports" : "Client list and report display order"}
          </p>
        </div>
        <ClientsTable isAdmin={isAdmin} />
      </div>
    </DashboardLayout>
  );
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -E "clients-table|ClientsTable|clients/page"
```

Expected: No errors.

- [ ] **Step 4: Commit Chunk 3**

```bash
git add -A
git commit -m "feat: migrate client list to Supabase with drag-and-drop reorder and admin CRUD"
```

---

## Chunk 4: User Management

### Task 12: Create user management API routes

**Files:**
- Create: `app/api/users/route.ts`
- Create: `app/api/users/[id]/route.ts`

- [ ] **Step 1: Create `app/api/users/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.app_metadata?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, role, is_active, created_at, invited_by")
      .order("created_at", { ascending: true });
    if (error) throw error;

    const adminClient = createSupabaseAdminClient();
    const { data: authUsers } = await adminClient.auth.admin.listUsers();
    const emailMap = new Map(authUsers.users.map((u) => [u.id, u.email]));

    const result = (data ?? []).map((p) => ({ ...p, email: emailMap.get(p.id) ?? "" }));
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching users:", error);
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user: caller } } = await supabase.auth.getUser();
    if (!caller || caller.app_metadata?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { email } = await request.json() as { email: string };
    if (!email?.trim()) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const adminClient = createSupabaseAdminClient();
    const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email.trim());
    if (error) throw error;

    await supabase.from("profiles").update({ invited_by: caller.id }).eq("id", data.user.id);

    return NextResponse.json({ success: true, userId: data.user.id }, { status: 201 });
  } catch (error) {
    console.error("Error inviting user:", error);
    return NextResponse.json({ error: "Failed to invite user" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create `app/api/users/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user: caller } } = await supabase.auth.getUser();
    if (!caller || caller.app_metadata?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json() as { role?: "admin" | "user"; is_active?: boolean };

    const profileUpdate: Record<string, unknown> = {};
    if (body.role !== undefined) profileUpdate.role = body.role;
    if (body.is_active !== undefined) profileUpdate.is_active = body.is_active;

    if (Object.keys(profileUpdate).length > 0) {
      const { error } = await supabase.from("profiles").update(profileUpdate).eq("id", id);
      if (error) throw error;
    }

    // Sync role into app_metadata JWT claim
    if (body.role !== undefined) {
      const adminClient = createSupabaseAdminClient();
      const { error } = await adminClient.auth.admin.updateUserById(id, {
        app_metadata: { role: body.role },
      });
      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating user:", error);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "api/users"
```

Expected: No errors.

---

### Task 13: Create the Users page and component

**Files:**
- Create: `app/users/page.tsx`
- Create: `components/users/users-table.tsx`

- [ ] **Step 1: Create `app/users/page.tsx`**

```typescript
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { UsersTable } from "@/components/users/users-table";

export default function UsersPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Users</h1>
          <p className="text-muted-foreground mt-2">
            Invite users, manage roles, and deactivate accounts
          </p>
        </div>
        <UsersTable />
      </div>
    </DashboardLayout>
  );
}
```

- [ ] **Step 2: Create `components/users/users-table.tsx`**

```typescript
"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UserPlus, Loader2, ShieldCheck, User, UserX } from "lucide-react";
import { toast } from "sonner";

interface UserRow {
  id: string;
  email: string;
  full_name: string | null;
  role: "admin" | "user";
  is_active: boolean;
  created_at: string;
}

export function UsersTable() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [isInviting, setIsInviting] = useState(false);

  useEffect(() => { fetchUsers(); }, []);

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/users");
      if (!res.ok) throw new Error();
      setUsers(await res.json());
    } catch { toast.error("Failed to load users"); }
    finally { setIsLoading(false); }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setIsInviting(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Invite failed");
      }
      toast.success(`Invite sent to ${inviteEmail}`);
      setIsInviteOpen(false);
      setInviteEmail("");
      fetchUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send invite");
    } finally { setIsInviting(false); }
  };

  const toggleRole = async (user: UserRow) => {
    const newRole = user.role === "admin" ? "user" : "admin";
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) throw new Error();
      toast.success(`${user.email} is now ${newRole}`);
      setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, role: newRole } : u));
    } catch { toast.error("Failed to update role"); }
  };

  const toggleActive = async (user: UserRow) => {
    const newActive = !user.is_active;
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: newActive }),
      });
      if (!res.ok) throw new Error();
      toast.success(`${user.email} ${newActive ? "activated" : "deactivated"}`);
      setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, is_active: newActive } : u));
    } catch { toast.error("Failed to update status"); }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Users</CardTitle>
            <CardDescription>Manage who has access to this dashboard</CardDescription>
          </div>
          <Button onClick={() => setIsInviteOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" /> Invite User
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id} className={!user.is_active ? "opacity-50" : ""}>
                <TableCell className="font-medium">{user.email}</TableCell>
                <TableCell className="text-muted-foreground">{user.full_name ?? "—"}</TableCell>
                <TableCell>
                  <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                    user.role === "admin"
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
                      : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                  }`}>
                    {user.role === "admin" ? <ShieldCheck className="h-3 w-3" /> : <User className="h-3 w-3" />}
                    {user.role}
                  </span>
                </TableCell>
                <TableCell>
                  <span className={`text-xs font-medium ${user.is_active ? "text-green-600" : "text-red-500"}`}>
                    {user.is_active ? "Active" : "Inactive"}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => toggleRole(user)}>
                      {user.role === "admin" ? "Make User" : "Make Admin"}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => toggleActive(user)}>
                      {user.is_active
                        ? <><UserX className="h-4 w-4 mr-1" />Deactivate</>
                        : "Activate"}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
        <DialogContent>
          <form onSubmit={handleInvite}>
            <DialogHeader>
              <DialogTitle>Invite User</DialogTitle>
              <DialogDescription>
                An email with a sign-in link will be sent. They will be assigned the User role by default.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Label htmlFor="invite-email">Email address</Label>
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="name@americanapartners.com"
                required
                className="mt-2"
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isInviting}>
                {isInviting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Send Invite
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -E "users"
```

Expected: No errors.

- [ ] **Step 4: Commit Chunk 4**

```bash
git add -A
git commit -m "feat: add user management page with invite, role toggle, and deactivate"
```

---

## Chunk 5: Report History, Storage, and Export Flow

### Task 14: Update report export to persist to Supabase

**Files:**
- Rewrite: `app/api/generate-report/route.ts`
- Modify: `components/ap-aging/file-upload.tsx`

- [ ] **Step 1: Rewrite `app/api/generate-report/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { generateMasterReport } from "@/lib/excel/generator";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { TransactionRow } from "@/lib/types";

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { transactions, reportName, sourceFiles } = body as {
    transactions: TransactionRow[];
    reportName: string;
    sourceFiles?: Array<{ name: string; size: number }>;
  };

  if (!transactions || !Array.isArray(transactions)) {
    return NextResponse.json({ error: "Invalid transactions data" }, { status: 400 });
  }

  // Create report row — status: processing
  const { data: reportRow, error: insertError } = await supabase
    .from("reports")
    .insert({
      report_name: reportName,
      report_date: new Date().toISOString().split("T")[0],
      status: "processing",
      created_by: user.id,
    })
    .select()
    .single();

  if (insertError || !reportRow) {
    return NextResponse.json({ error: "Failed to create report record" }, { status: 500 });
  }

  const reportId = reportRow.id;

  if (sourceFiles && sourceFiles.length > 0) {
    await supabase.from("report_files").insert(
      sourceFiles.map((f) => ({ report_id: reportId, file_name: f.name, file_size: f.size }))
    );
  }

  try {
    const excelBuffer = await generateMasterReport(transactions, reportName);

    const adminClient = createSupabaseAdminClient();
    const storagePath = `${user.id}/${reportId}.xlsx`;
    const { error: uploadError } = await adminClient.storage
      .from("reports")
      .upload(storagePath, new Uint8Array(excelBuffer), {
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        upsert: true,
      });
    if (uploadError) throw uploadError;

    await supabase
      .from("reports")
      .update({ status: "completed", file_url: storagePath })
      .eq("id", reportId);

    const safeFileName = `${reportName.replace(/[^a-zA-Z0-9_\-. ]/g, "_")}.xlsx`;
    return new NextResponse(new Uint8Array(excelBuffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${safeFileName}"`,
      },
    });
  } catch (error) {
    console.error("Error generating report:", error);
    await supabase.from("reports").update({ status: "failed" }).eq("id", reportId);
    return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Update `components/ap-aging/file-upload.tsx` — add `sourceFiles` to the export fetch call**

Find the `fetch("/api/generate-report", ...)` call in the component (inside `handleExport` or a similar function). Update the request body to include source file metadata. The `files` state array is in scope at this point.

Locate the existing body:
```typescript
body: JSON.stringify({
  transactions: processedData,
  reportName,
}),
```

Replace with:
```typescript
body: JSON.stringify({
  transactions: processedData,
  reportName,
  sourceFiles: files.map(({ file }) => ({ name: file.name, size: file.size })),
}),
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "generate-report"
```

Expected: No errors.

---

### Task 15: Add download route and rewrite report history

**Files:**
- Create: `app/api/reports/[id]/download/route.ts`
- Rewrite: `app/api/reports/route.ts`
- Rewrite: `components/history/report-history.tsx`
- Rewrite: `app/history/page.tsx`

- [ ] **Step 1: Create `app/api/reports/[id]/download/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.app_metadata?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const { data: report, error } = await supabase
      .from("reports")
      .select("file_url, report_name, status")
      .eq("id", id)
      .single();

    if (error || !report) return NextResponse.json({ error: "Report not found" }, { status: 404 });
    if (report.status !== "completed" || !report.file_url) {
      return NextResponse.json({ error: "File not available" }, { status: 400 });
    }

    const adminClient = createSupabaseAdminClient();
    const { data: signedData, error: signError } = await adminClient.storage
      .from("reports")
      .createSignedUrl(report.file_url, 3600);

    if (signError || !signedData) throw signError;

    return NextResponse.json({ url: signedData.signedUrl, name: report.report_name });
  } catch (error) {
    console.error("Error generating download URL:", error);
    return NextResponse.json({ error: "Failed to generate download link" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Rewrite `app/api/reports/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.app_metadata?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("reports")
      .select("*, report_files(id, file_name, file_size), profiles(full_name)")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching reports:", error);
    return NextResponse.json({ error: "Failed to fetch reports" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Rewrite `components/history/report-history.tsx`**

```typescript
"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Loader2, FileSpreadsheet, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import type { Report } from "@/lib/types";
import { isReportStatus } from "@/lib/types";

interface ReportWithFiles extends Report {
  report_files: Array<{ id: string; file_name: string; file_size: number }>;
  profiles: { full_name: string | null } | null;
}

export function ReportHistory() {
  const [reports, setReports] = useState<ReportWithFiles[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => { fetchReports(); }, []);

  const fetchReports = async () => {
    try {
      const res = await fetch("/api/reports");
      if (!res.ok) throw new Error();
      setReports(await res.json());
    } catch { toast.error("Failed to load report history"); }
    finally { setIsLoading(false); }
  };

  const handleDownload = async (reportId: string, reportName: string) => {
    setDownloadingId(reportId);
    try {
      const res = await fetch(`/api/reports/${reportId}/download`);
      if (!res.ok) throw new Error();
      const { url, name } = await res.json();
      const link = document.createElement("a");
      link.href = url;
      link.download = `${name}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("Download started");
    } catch { toast.error("Failed to download report"); }
    finally { setDownloadingId(null); }
  };

  const toggleExpand = (id: string) =>
    setExpandedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  const formatBytes = (b: number) =>
    b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;

  const statusBadge = (status: string) => {
    const safeStatus = isReportStatus(status) ? status : "processing";
    const cls = {
      completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      processing: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
      failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    };
    return (
      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls[safeStatus]}`}>
        {safeStatus.charAt(0).toUpperCase() + safeStatus.slice(1)}
      </span>
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Report History</CardTitle>
        <CardDescription>View and download previously generated master reports</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Report Name</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Generated By</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reports.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  <div className="flex flex-col items-center gap-2">
                    <FileSpreadsheet className="h-12 w-12 text-muted-foreground/50" />
                    <p>No reports generated yet</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              reports.flatMap((report) => {
                const rows = [
                  <TableRow key={report.id}>
                    <TableCell>
                      {report.report_files?.length > 0 && (
                        <button onClick={() => toggleExpand(report.id)} className="text-muted-foreground hover:text-foreground">
                          {expandedIds.has(report.id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{report.report_name}</TableCell>
                    <TableCell>{report.report_date}</TableCell>
                    <TableCell className="text-muted-foreground">{report.profiles?.full_name ?? "—"}</TableCell>
                    <TableCell>{statusBadge(report.status)}</TableCell>
                    <TableCell>{formatDate(report.created_at)}</TableCell>
                    <TableCell className="text-right">
                      {report.status === "completed" && report.file_url && (
                        <Button variant="ghost" size="sm" disabled={downloadingId === report.id}
                          onClick={() => handleDownload(report.id, report.report_name)}>
                          {downloadingId === report.id
                            ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            : <Download className="h-4 w-4 mr-2" />}
                          Download
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>,
                ];
                if (expandedIds.has(report.id) && report.report_files?.length > 0) {
                  rows.push(
                    <TableRow key={`${report.id}-files`} className="bg-muted/30">
                      <TableCell />
                      <TableCell colSpan={6} className="py-2">
                        <p className="text-xs font-medium text-muted-foreground mb-1">Source files:</p>
                        <ul className="space-y-0.5">
                          {report.report_files.map((f) => (
                            <li key={f.id} className="text-xs text-muted-foreground flex gap-3">
                              <span>{f.file_name}</span>
                              <span className="text-muted-foreground/60">{formatBytes(f.file_size)}</span>
                            </li>
                          ))}
                        </ul>
                      </TableCell>
                    </TableRow>
                  );
                }
                return rows;
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Rewrite `app/history/page.tsx`**

```typescript
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ReportHistory } from "@/components/history/report-history";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function HistoryPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== "admin") redirect("/");

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Report History</h1>
          <p className="text-muted-foreground mt-2">View and download previously generated master reports</p>
        </div>
        <ReportHistory />
      </div>
    </DashboardLayout>
  );
}
```

- [ ] **Step 5: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1
```

Expected: No errors.

- [ ] **Step 6: Commit Chunk 5**

```bash
git add -A
git commit -m "feat: wire report export to Supabase Storage; signed-URL download; report history with source files"
```

---

## Chunk 6: Final — Types, Build, Admin Setup

### Task 16: Regenerate database types and verify build

**Files:**
- Rewrite: `lib/supabase/database.types.ts`

- [ ] **Step 1: Regenerate Supabase types**

If Supabase CLI is installed:
```bash
npx supabase gen types typescript --project-id uicbuzmduirdbeehygrg > lib/supabase/database.types.ts
```

If CLI is not installed, replace `lib/supabase/database.types.ts` with:

```typescript
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string; full_name: string | null; role: string; is_active: boolean;
          invited_by: string | null; created_at: string; updated_at: string;
        }
        Insert: {
          id: string; full_name?: string | null; role?: string; is_active?: boolean;
          invited_by?: string | null; created_at?: string; updated_at?: string;
        }
        Update: {
          id?: string; full_name?: string | null; role?: string; is_active?: boolean;
          invited_by?: string | null; created_at?: string; updated_at?: string;
        }
      }
      clients: {
        Row: { id: string; name: string; display_order: number; created_at: string; updated_at: string; }
        Insert: { id?: string; name: string; display_order: number; created_at?: string; updated_at?: string; }
        Update: { id?: string; name?: string; display_order?: number; created_at?: string; updated_at?: string; }
      }
      reports: {
        Row: {
          id: string; report_name: string; report_date: string; file_url: string | null;
          status: string; created_by: string | null; created_at: string; updated_at: string;
        }
        Insert: {
          id?: string; report_name: string; report_date: string; file_url?: string | null;
          status?: string; created_by?: string | null; created_at?: string; updated_at?: string;
        }
        Update: {
          id?: string; report_name?: string; report_date?: string; file_url?: string | null;
          status?: string; created_by?: string | null; created_at?: string; updated_at?: string;
        }
      }
      report_files: {
        Row: { id: string; report_id: string; file_name: string; file_size: number; uploaded_at: string; }
        Insert: { id?: string; report_id: string; file_name: string; file_size: number; uploaded_at?: string; }
        Update: { id?: string; report_id?: string; file_name?: string; file_size?: number; uploaded_at?: string; }
      }
    }
  }
}
```

- [ ] **Step 2: Run the production build**

```bash
npm run build 2>&1 | tail -30
```

Expected: Build completes successfully. Address any errors before continuing.

- [ ] **Step 3: Final commit and push**

```bash
git add -A
git commit -m "feat: update DB types; Supabase integration complete"
git push origin master
```

---

### Task 17: Initial admin setup (manual — performed by a human)

> These steps are done in the Supabase dashboard, not by the implementation agent.

- [ ] **Step 1: Send invite emails**

Navigate to: https://supabase.com/dashboard/project/uicbuzmduirdbeehygrg/auth/users

Click **Invite user** and invite:
- `joseph@nonzeroai.com`
- `aspradley@americanapartners.com`

- [ ] **Step 2: Both admins accept the invite and set passwords**

They receive a magic-link email. Clicking it opens the dashboard login.

- [ ] **Step 3: Elevate both to admin role**

In the SQL Editor, run:

```sql
-- Update profiles table
UPDATE profiles SET role = 'admin'
WHERE id IN (
  SELECT id FROM auth.users
  WHERE email IN ('joseph@nonzeroai.com', 'aspradley@americanapartners.com')
);

-- Update app_metadata so the JWT role claim is correct
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'::jsonb
WHERE email IN ('joseph@nonzeroai.com', 'aspradley@americanapartners.com');
```

- [ ] **Step 4: Verify admin access**

Sign in as `joseph@nonzeroai.com`. Confirm:
- [ ] Sidebar shows History and Users links
- [ ] `/history` loads without redirect
- [ ] `/users` loads and shows the two admin accounts
- [ ] `/clients` shows drag handles and Add/Edit/Delete buttons

- [ ] **Step 5: Verify regular user flow**

From the Users page, invite a test email. Accept the invite. Confirm:
- [ ] Sidebar shows only AP Aging Detail and Clients
- [ ] `/history` redirects to `/`
- [ ] `/users` redirects to `/`
- [ ] Upload + export flow works end-to-end
- [ ] After export, report appears in History tab when signed in as admin

---

## Summary of All Files Changed

| Action | File |
|---|---|
| **Delete** | `auth.ts` |
| **Delete** | `app/api/auth/[...nextauth]/route.ts` |
| **Delete** | `components/auth/session-provider.tsx` |
| **Delete** | `lib/constants/clients.ts` |
| **Delete** | `lib/local-store.ts` |
| **Delete** | `supabase/schema.sql` |
| **Create** | `middleware.ts` |
| **Create** | `lib/supabase/client.ts` |
| **Create** | `lib/supabase/admin.ts` |
| **Create** | `lib/supabase/middleware.ts` |
| **Create** | `app/actions/auth.ts` |
| **Create** | `app/users/page.tsx` |
| **Create** | `app/api/users/route.ts` |
| **Create** | `app/api/users/[id]/route.ts` |
| **Create** | `app/api/clients/reorder/route.ts` |
| **Create** | `app/api/reports/[id]/download/route.ts` |
| **Create** | `components/users/users-table.tsx` |
| **Create** | `supabase/migrations/001_schema.sql` |
| **Create** | `supabase/migrations/002_seed_clients.sql` |
| **Rewrite** | `lib/supabase/server.ts` |
| **Rewrite** | `lib/supabase/database.types.ts` |
| **Rewrite** | `components/auth/login-form.tsx` |
| **Rewrite** | `components/layout/sidebar.tsx` |
| **Rewrite** | `components/clients/clients-table.tsx` |
| **Rewrite** | `components/history/report-history.tsx` |
| **Rewrite** | `app/api/clients/route.ts` |
| **Rewrite** | `app/api/clients/[id]/route.ts` |
| **Rewrite** | `app/api/parse-files/route.ts` |
| **Rewrite** | `app/api/generate-report/route.ts` |
| **Rewrite** | `app/api/reports/route.ts` |
| **Rewrite** | `app/history/page.tsx` |
| **Modify** | `app/layout.tsx` |
| **Modify** | `app/clients/page.tsx` |
| **Modify** | `components/ap-aging/file-upload.tsx` |
| **Modify** | `lib/types/index.ts` |
| **Modify** | `.env.local` |
| **Modify** | `package.json` |
