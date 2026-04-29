# Supabase Integration Design

**Date:** 2026-04-29
**Project:** Superior AP Aging Dashboard
**Status:** Approved

---

## Overview

Replace NextAuth + local file storage with Supabase Auth and Supabase Database/Storage as the single source of truth. Add role-based access control (admin vs. user), user management, client list migration with drag-and-drop reorder, and report history with file storage.

---

## 1. Database Schema

### `auth.users`
Supabase built-in. Holds email, hashed password, OAuth tokens. Not modified directly.

### `profiles`
One row per user, linked to `auth.users` via `id` (UUID). Created automatically by a database trigger (`on_auth_user_created`) when a new `auth.users` row is inserted. Role defaults to `'user'`. The trigger also copies the role from `auth.users.app_metadata->>'role'` if present, which allows the invite flow to pre-assign admin roles.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | FK → `auth.users.id`, primary key |
| `full_name` | TEXT | Optional display name |
| `role` | TEXT | `'admin'` or `'user'`, default `'user'` |
| `is_active` | BOOLEAN | Default `true`. Admins can deactivate. |
| `invited_by` | UUID | FK → `profiles.id`, nullable. Set on invite. |
| `created_at` | TIMESTAMPTZ | Auto |
| `updated_at` | TIMESTAMPTZ | Auto, via trigger |

### `clients`
Replaces `lib/constants/clients.ts`. Global, ordered list of AP Aging clients.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `name` | TEXT | Client/company name |
| `display_order` | INTEGER | Global sort order; determines report output order |
| `created_at` | TIMESTAMPTZ | Auto |
| `updated_at` | TIMESTAMPTZ | Auto, via trigger |

Seeded by migration from the current hardcoded list (37 clients, `display_order` 1–37). Reorder updates all affected rows atomically in a single transaction.

### `reports`
One row per generated master AP Aging report.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `report_name` | TEXT | User-provided name |
| `report_date` | TEXT | Date string on report |
| `file_url` | TEXT | Supabase Storage **path** (not a public URL), nullable until upload completes |
| `status` | TEXT | `'processing'` \| `'completed'` \| `'failed'` |
| `created_by` | UUID | FK → `profiles.id` |
| `created_at` | TIMESTAMPTZ | Auto |
| `updated_at` | TIMESTAMPTZ | Auto, via trigger |

### `report_files`
One row per source `.xls` file uploaded to create a report.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `report_id` | UUID | FK → `reports.id` |
| `file_name` | TEXT | Original filename |
| `file_size` | INTEGER | Bytes |
| `uploaded_at` | TIMESTAMPTZ | Auto |

### Supabase Storage — `reports` bucket
**Private bucket.** Stores generated `.xlsx` files at path `{user_id}/{report_id}.xlsx`. Files are never exposed via public URLs. All downloads use signed URLs generated server-side (see Section 4).

### Row Level Security (RLS)

All API routes use a **session-aware** Supabase client (created with `@supabase/ssr`, reading the user's JWT from cookies). The service role key is **only** used for admin invite operations. Because the session client is used for all data operations, RLS policies are enforced at the database level as a backstop.

| Table | Policy | Principal | Condition |
|---|---|---|---|
| `profiles` | SELECT | Authenticated | `id = auth.uid()` |
| `profiles` | SELECT, UPDATE | Admin | `role = 'admin'` in JWT app_metadata |
| `clients` | SELECT | Authenticated | Always |
| `clients` | INSERT, UPDATE, DELETE | Admin only | `role = 'admin'` in JWT app_metadata |
| `reports` | INSERT | Authenticated | `created_by = auth.uid()` |
| `reports` | SELECT, UPDATE | Admin only | `role = 'admin'` in JWT app_metadata |
| `report_files` | INSERT | Authenticated | Always (report_id must be own report via FK) |
| `report_files` | SELECT | Admin only | `role = 'admin'` in JWT app_metadata |
| Storage `reports` | All | Admin only | `role = 'admin'` in JWT app_metadata |

> **Note:** Non-admin users can insert their own `reports` and `report_files` rows (the export flow is available to all authenticated users). Admins can read all reports. Regular users cannot read reports created by others.

---

## 2. Authentication & User Management

### Sign-in
Supabase Auth with email/password. The existing login form UI (`components/auth/login-form.tsx`) is rewired to call `supabase.auth.signInWithPassword()`. Microsoft Entra ID OAuth is removed for now; it can be re-added through the Supabase dashboard without code changes.

### Session handling
`@supabase/ssr` manages cookie-based sessions in Next.js App Router.

**`lib/supabase/server.ts`** — completely rewritten. The existing file uses a module-level service role singleton and is incompatible with `@supabase/ssr`. The new implementation exports a `createSupabaseServerClient()` factory function that must be called per-request inside async server functions, reading/writing cookies from Next.js `cookies()`:

```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function createSupabaseServerClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: ..., remove: ... } }
  )
}
```

A separate `createSupabaseAdminClient()` is exported using the service role key, used **only** for `auth.admin.inviteUserByEmail()`.

**`lib/supabase/middleware.ts`** — exports `updateSession()` which refreshes the session cookie on each request.

**`middleware.ts`** (project root) — calls `updateSession()` then reads the role from `session.user.app_metadata.role` (JWT claim, no DB query). Redirects:
- Unauthenticated → `/login`
- Non-admin on `/history` → `/`
- Non-admin on `/users` → `/`

**Role in JWT:** The `role` field is stored in `auth.users.app_metadata` so it is embedded in the JWT and readable in middleware without a database round-trip. When an admin changes a user's role, the server action calls `supabase.auth.admin.updateUserById(id, { app_metadata: { role } })` to keep the JWT claim in sync with the `profiles` table.

### Initial admin setup
There is no migration that pre-inserts admin profiles (this would violate the FK constraint since `auth.users` rows do not exist yet). Instead:

1. Run migrations 001 and 002 (schema + client seed)
2. Use the Supabase dashboard to send invite emails to `joseph@nonzeroai.com` and `aspradley@americanapartners.com`
3. After they accept and sign in, run the following SQL once to elevate their roles:
   ```sql
   -- Step 1: Update the profiles table
   UPDATE profiles SET role = 'admin' WHERE id IN (
     SELECT id FROM auth.users WHERE email IN (
       'joseph@nonzeroai.com', 'aspradley@americanapartners.com'
     )
   );
   -- Step 2: Update app_metadata so the JWT role claim is correct
   UPDATE auth.users
   SET raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'::jsonb
   WHERE email IN ('joseph@nonzeroai.com', 'aspradley@americanapartners.com');
   ```

### User invite flow (admin only)
1. Admin navigates to `/users` (new page, admin-only)
2. Enters an email address and submits
3. Server action calls `adminClient.auth.admin.inviteUserByEmail(email)` — sends a magic-link email
4. On first sign-in, the `on_auth_user_created` trigger auto-creates a `profiles` row (role: `user`)
5. Admin can return to `/users` and toggle role (`admin` ↔ `user`) — server action calls `auth.admin.updateUserById` to update both `profiles.role` and `app_metadata.role` atomically
6. Admin can deactivate a user — sets `profiles.is_active = false`; deactivated users are rejected at the API layer

### Role enforcement — layers
1. **JWT claim** (`app_metadata.role`) — read in middleware with zero DB queries
2. **API routes** — each mutating route calls `createSupabaseServerClient()`, reads the session, and checks role before proceeding (does not rely solely on RLS)
3. **RLS** — database-level backstop; fires because the session-aware client (not the service role client) is used for all data operations

---

## 3. Client List Migration & Reorder

### Migration
`supabase/migrations/002_seed_clients.sql` inserts all 37 clients from the current `DEFAULT_CLIENTS` array with `display_order` 1–37 in exact current sequence.

After successful migration and verification:
- `lib/constants/clients.ts` is deleted
- `lib/local-store.ts` is deleted
- All references to `DEFAULT_CLIENTS` and `localStore` are replaced with Supabase queries

### Reading clients
`/api/clients` queries `clients` table ordered by `display_order ASC`. No local fallback — Supabase is always the source.

### Admin CRUD (Clients page)
- **Add** — enter name; appended at end (`display_order = max + 1`); writes to Supabase immediately
- **Edit** — update name in-place; writes to Supabase immediately
- **Delete** — confirmation dialog; removes row; remaining `display_order` values are re-normalized in the same transaction
- All mutations are admin-only, enforced by middleware + API route auth check + RLS

### Drag-and-drop reorder (admin only, globally persistent)
- `@dnd-kit/sortable` handles drag interactions in the Clients page UI
- On drop, the full reordered list is sent to the server
- A single database transaction updates **all** `display_order` values atomically (using `UPDATE clients SET display_order = CASE id ... END`) to prevent gaps, collisions, or partial updates
- The updated order is immediately reflected for all users and all subsequent report exports
- `clients.display_order` is the single source of truth for report output order

---

## 4. Report History & File Storage

### Export flow (all authenticated users)
When the user clicks "Export to Excel":
1. POST to `/api/generate-report` — inserts a `reports` row with status `processing` and `created_by = auth.uid()`
2. Inserts `report_files` rows for each source `.xls` uploaded (file name + size)
3. Generates the `.xlsx` file (existing generator, unchanged)
4. Uploads file to Supabase Storage at `{user_id}/{report_id}.xlsx` using `adminClient` (service role needed to write to private bucket)
5. Updates `reports` row: sets `file_url` (the Storage path, not a public URL) and status `completed`
6. On any failure: sets status `failed`

### History tab (admin only)
Displays a table of all reports:
- Report Name
- Report Date
- Generated By (full name from `profiles`)
- Status badge (`completed` / `processing` / `failed`)
- Source files (expandable list of file names and sizes from `report_files`)
- Download button

History link is hidden in the sidebar for non-admin users. Middleware redirects any direct URL access by non-admins.

### Download mechanism
`file_url` in the `reports` table is a **Storage path**, not a public URL. Downloads must go through a server-side signed URL:

1. Admin clicks Download
2. Client calls `GET /api/reports/[id]/download`
3. Route fetches the `reports` row (session-aware client, admin check)
4. Calls `adminClient.storage.from('reports').createSignedUrl(fileUrl, 3600)`
5. Returns the signed URL to the client
6. Client navigates to the signed URL (1-hour expiry)

The signed URL pattern is required because the Storage bucket is private.

---

## 5. Legacy Code Removal

### Removed
| File | Reason |
|---|---|
| `lib/local-store.ts` | Replaced by Supabase |
| `lib/constants/clients.ts` | Replaced by Supabase `clients` table |
| `app/api/auth/[...nextauth]/route.ts` | Replaced by Supabase Auth |
| `auth.ts` (project root) | NextAuth config; removing it allows `next-auth` package to be uninstalled |
| `components/auth/session-provider.tsx` | NextAuth-specific, no longer needed |
| `supabase/schema.sql` | Replaced by versioned migrations; leaving it risks applying stale permissive RLS policies |
| `next-auth` from `package.json` | Replaced by `@supabase/ssr` + `@supabase/supabase-js` |

### Added
| File | Purpose |
|---|---|
| `middleware.ts` | Session guard + role-based route protection (reads role from JWT, no DB query) |
| `lib/supabase/client.ts` | Browser-side Supabase client (anon key) |
| `lib/supabase/server.ts` | **Fully rewritten** — per-request session-aware server client using `@supabase/ssr` |
| `lib/supabase/admin.ts` | Service-role admin client, used only for invite + role update operations |
| `lib/supabase/middleware.ts` | Session refresh helper called by `middleware.ts` |
| `app/users/page.tsx` | Admin-only user management page |
| `components/users/users-table.tsx` | Invite, role toggle, deactivate UI |
| `app/api/reports/[id]/download/route.ts` | Generates signed Storage URL for report download |
| `supabase/migrations/001_schema.sql` | Full schema: tables, triggers, RLS policies |
| `supabase/migrations/002_seed_clients.sql` | Inserts 37 clients from DEFAULT_CLIENTS |

### Modified
| File | Change |
|---|---|
| `components/auth/login-form.tsx` | Rewire to `supabase.auth.signInWithPassword()`, remove NextAuth imports |
| `components/layout/sidebar.tsx` | Hide History + Users links for non-admins; read session from Supabase cookie |
| `app/layout.tsx` | Remove NextAuth `SessionProvider` |
| `app/history/page.tsx` | Server component reads Supabase session; admin-only guard |
| `app/clients/page.tsx` | Enforce admin role for mutations |
| `components/clients/clients-table.tsx` | Add drag-and-drop reorder (`@dnd-kit/sortable`), admin CRUD |
| `components/history/report-history.tsx` | Download calls `/api/reports/[id]/download` for signed URL; show source files |
| `components/ap-aging/file-upload.tsx` | Write `reports` + `report_files` rows on export; handle processing/failed status |
| `lib/supabase/database.types.ts` | **Must be regenerated** after migrations run: `supabase gen types typescript --project-id uicbuzmduirdbeehygrg > lib/supabase/database.types.ts` |
| `.env.local` | Add Supabase vars (already present); remove `AUTH_SECRET`, `AUTH_URL`, `AUTH_ADMIN_PASSWORD`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID` |
| `package.json` | Remove `next-auth`; add `@supabase/ssr`; remove `nodemailer` (transactional email now handled by Supabase's built-in invite emails) |

---

## 6. Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=<supabase project url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
```

`SUPABASE_SERVICE_ROLE_KEY` is server-only — only imported in `lib/supabase/admin.ts`, never referenced from client components or exposed to the browser.

All NextAuth variables are removed from `.env.local`.

---

## 7. Dependencies

### Added
- `@supabase/supabase-js` — Supabase JS client (may already be installed; verify)
- `@supabase/ssr` — Cookie-based session management for Next.js App Router (**must be installed**: `npm install @supabase/ssr`)
- `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` — Drag-and-drop reorder

### Removed
- `next-auth`
- `nodemailer` — transactional email is now handled by Supabase's built-in invite email system

---

## 8. Migration Execution Order

1. Delete `supabase/schema.sql` (the old permissive-RLS schema file) before running new migrations
2. Run `001_schema.sql` — creates all tables, triggers, RLS policies
3. Run `002_seed_clients.sql` — inserts 37 clients
4. Deploy code changes
5. Verify client list renders correctly from Supabase
6. Delete `lib/constants/clients.ts` and `lib/local-store.ts`; remove all references
7. Regenerate `lib/supabase/database.types.ts` using Supabase CLI
8. Use Supabase dashboard to send invite emails to `joseph@nonzeroai.com` and `aspradley@americanapartners.com`
9. After both accept and sign in, run the admin elevation SQL (see Section 2) to set their roles to `admin`
10. Verify sign-in, role-based redirects, client management, export, and history download end-to-end
