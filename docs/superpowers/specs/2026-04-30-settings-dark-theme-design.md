# Settings Panel + Dark Theme — Design Spec

_Date: 2026-04-30_

## Overview

Two features shipped together: a **Settings page** replacing the existing Users page (with a direct "Add User" flow), and a **dark theme toggle** in the sidebar that applies the app's existing black + gold palette throughout.

---

## 1. Dark Theme Toggle

### Behaviour

- A toggle labelled "Dark mode" sits in the sidebar footer, below the signed-in user's name.
- Toggling on adds `class="dark"` to `document.documentElement` (`<html>`); toggling off removes it.
- State persists in `localStorage` under the key `theme` (`"dark"` | `"light"`).
- **Hydration / SSR:** The sidebar is a `"use client"` component. Read `localStorage` inside a `useEffect` on mount and apply the class — never during SSR. Add `suppressHydrationWarning` to `<html>` in `app/layout.tsx` to silence React mismatch warnings (the class is absent during server render, present after hydration).
- **CSS variant fix:** `globals.css` line 5 defines `@custom-variant dark (&:is(.dark *))` — this matches only children of `.dark`, not the `.dark` element itself. Update this line to `@custom-variant dark (&:is(.dark, .dark *))` so token overrides on `<html class="dark">` take effect. This one-line change must be made alongside the token updates.

### Color values — updating the `.dark` block

**Do not replace the entire `.dark` block.** Update only the tokens listed below; leave all others (`--popover`, `--secondary`, `--accent`, `--destructive`, `--ring`, `--chart-*`, `--sidebar-foreground`, `--sidebar-primary-foreground`, etc.) at their existing values.

| Token | New value |
|---|---|
| `--background` | `oklch(0.067 0 0)` |
| `--foreground` | `oklch(0.985 0 0)` |
| `--card` | `oklch(0.1 0 0)` |
| `--card-foreground` | `oklch(0.985 0 0)` |
| `--border` | `oklch(0.55 0.08 75 / 20%)` |
| `--input` | `oklch(1 0 0 / 8%)` |
| `--primary` | `oklch(0.72 0.1 75)` |
| `--primary-foreground` | `oklch(0.1 0 0)` |
| `--muted` | `oklch(0.18 0 0)` |
| `--muted-foreground` | `oklch(0.6 0 0)` |
| `--sidebar` | `oklch(0.1 0 0)` |
| `--sidebar-border` | `oklch(0.55 0.08 75 / 15%)` |
| `--sidebar-primary` | `oklch(0.72 0.1 75)` |
| `--sidebar-accent` | `oklch(0.15 0 0)` |

**Gold border on cards:** The `--border` token drives Tailwind's `border-border` utility. Shadcn `Card` components already use `border` — the gold-tinted border is automatic from the token.

---

## 2. Settings Page

### Navigation

- The "Users" nav item in `sidebar.tsx` is renamed **"Settings"**, icon changed to `Settings` from lucide-react.
- Route stays `/users` — no file rename, no redirect.
- Page `<h1>` becomes "Settings"; subtitle: "Manage users and application preferences".
- Admin-only visibility unchanged.

### Layout

- Single `Card` with header "User Management" / subheading "Add and manage who has access to this dashboard".
- "Add User" button (primary/gold, top-right of card header) replaces the current "Invite User" button.

### User Table

Columns: Email · Name · Role · Status · Actions.

- Role badge: gold pill for admin, grey pill for user.
- Status: "● Active" (green) or "● Inactive" (muted) from `is_active` on the profile row.
- **Inactive users remain visible** — they can no longer sign in but may still have a profile row from before this feature shipped.
- **Actions column:**
  - Toggle role: "Make Admin" / "Make User" (existing behaviour, unchanged).
  - **"Remove" button on every row** — opens a confirmation dialog. Labelled "Remove" (not "Deactivate") to communicate permanence.

> The old Activate / Deactivate soft toggle (`is_active` patching via `toggleActive`) is removed from the component. Existing inactive users are display-only with no re-activation path.

---

## 3. Add User Dialog

### Trigger

"Add User" button in the Settings card header.

### Fields

| Field | Type | Required | Validation |
|---|---|---|---|
| Email | email input | Yes | Domain must be `@americanapartners.com` or `@nonzeroai.com`; inline error on blur, blocked on submit |
| Full Name | text input | No | — |
| Password | password input | Yes | Min 8 characters; inline error on blur |
| Role | segmented control (User / Admin) | Yes | Defaults to "User" |

### API — `POST /api/users`

**This changes the existing POST handler** — update both `users-table.tsx` (client) and `route.ts` (server) together.

**Request body:** `{ email, password, full_name?, role }`

**Server logic:**

1. Auth-guard: caller must have `app_metadata.role === "admin"` → 403 otherwise.
2. Domain check (server-side): reject emails not ending in `@americanapartners.com` or `@nonzeroai.com` → 400 `{ error: "Domain not allowed" }`.
3. Call `adminClient.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: full_name ?? '' }, app_metadata: { role } })`.
4. On Supabase error: return `{ error: error.message }` with status 400 (forwards Supabase's message verbatim, e.g. "User already registered").
5. On success: return `{ success: true, userId: data.user.id }` with status 201.
6. The `handle_new_user` DB trigger auto-creates the `profiles` row. If it fails, the user exists in auth without a profile row — acceptable edge case, no compensating action.

### Dialog UX

- On success: toast "User created", dialog closes, table refreshes.
- On API error: inline error banner inside the dialog (above the footer buttons).

---

## 4. Remove User (Hard Delete)

### Trigger

"Remove" button on any user row in the Settings table.

### Confirmation dialog

```text
Title:   Remove user?
Body:    This will permanently remove {email} from the dashboard.
         They will no longer be able to sign in. This cannot be undone.
Buttons: [Cancel]  [Remove User]   ← destructive red button
```

### API — `DELETE /api/users/{id}`

**Added to the existing `app/api/users/[id]/route.ts` alongside the `PATCH` export.**

**Server logic:**

1. Auth-guard: caller must be admin → 403.
2. Resolve params with `const { id } = await params` (async params — same pattern as existing `PATCH`).
3. Self-deletion guard: if `id === caller.id` → return 400 `{ error: "You cannot remove your own account." }`.
4. Call `adminClient.auth.admin.deleteUser(id)`.
5. The `profiles` row cascade-deletes via `ON DELETE CASCADE` FK — no extra query needed.
6. On success: 200 `{ success: true }`.
7. On Supabase error: 500 `{ error: "Failed to remove user" }`.

### `PATCH` route — `is_active` handling

Leave `PATCH` as-is. It still accepts `{ role?, is_active? }` — the `is_active` path simply goes unused once the component no longer calls it. No code removal needed in the route.

### Table UX

- On success: toast "User removed", row removed from local state.
- On error: toast "Failed to remove user".

---

## 5. Files Changed

| File | Change |
|---|---|
| `app/globals.css` | Update specific tokens in `.dark` block (see Section 1 table) |
| `app/layout.tsx` | Add `suppressHydrationWarning` to `<html>` element |
| `components/layout/sidebar.tsx` | Add dark toggle (useEffect + localStorage); rename "Users" nav item to "Settings" with `Settings` icon |
| `components/users/users-table.tsx` | Replace Invite dialog → Add User dialog; replace Activate/Deactivate toggles → "Remove" button + confirmation dialog |
| `app/api/users/route.ts` | Update `POST`: accept `{ email, password, full_name?, role }`, call `createUser`, forward Supabase errors |
| `app/api/users/[id]/route.ts` | Add `DELETE` export alongside existing `PATCH` |

---

## 6. Out of Scope

- Password reset / forgot password flow
- Email notifications of any kind
- Editing an existing user's email, password, or name after creation
- Profile picture / avatar
- Re-activating previously soft-deactivated users (display-only, no action available)
