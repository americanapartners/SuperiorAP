# Edit User — Design Spec

_Date: 2026-04-30_

## Overview

Admins can edit any user's full name, email, password, and role from the Settings page. A pencil icon on each row opens a pre-populated Edit User dialog. The existing "Make Admin / Make User" toggle button is removed — role is now managed exclusively in the edit dialog.

Admins may self-edit their own name, email, and password (self-PATCH for those fields is explicitly allowed). The role field is disabled when editing one's own account (self-demotion prevention). Any admin may change another admin's role.

---

## 1. UI Changes — `components/users/users-table.tsx`

### Actions column

- Remove the "Make Admin / Make User" `toggleRole` button and the `toggleRole` function.
- Add `Pencil` to the lucide-react import line alongside the existing icons.
- Actions column becomes two buttons per row: **Edit** (pencil icon, `Pencil`) and **Remove** (trash icon, existing).

### New types

```ts
interface EditForm {
  full_name: string;
  email: string;
  password: string;
  role: "admin" | "user";
}
```

### New state

```ts
const [editTarget, setEditTarget] = useState<UserRow | null>(null);
const [editForm, setEditForm] = useState<EditForm>({ full_name: "", email: "", password: "", role: "user" });
const [editError, setEditError] = useState<string | null>(null);
const [editEmailDomainError, setEditEmailDomainError] = useState<string | null>(null);
const [isSaving, setIsSaving] = useState(false);
const [currentUserId, setCurrentUserId] = useState<string | null>(null);
```

`currentUserId` is fetched once on mount via `GET /api/users/me` (see Section 2) and stored in state. It is used to disable the role picker when the logged-in admin is editing their own row.

### Edit dialog

**Trigger:** Clicking the pencil icon sets `editTarget` to that row's user and pre-populates `editForm`:
```ts
{ full_name: user.full_name ?? "", email: user.email, password: "", role: user.role }
```

**Fields:**

| Field | Type | Validation |
|---|---|---|
| Full Name | text | Optional |
| Email | email | Same domain check as Add: `@americanapartners.com` or `@nonzeroai.com`; inline error on blur, blocked on submit |
| Password | password | Optional — only sent if non-empty. If non-empty, must be ≥ 8 characters. Placeholder: "Leave blank to keep current password" |
| Role | User / Admin segmented control | Disabled (greyed out + pointer-events-none) when `editTarget.id === currentUserId`. Note shown below the control: "You cannot change your own role." |

**Submit logic (`handleEdit`):**

1. Client-side domain check on email (`domainError` helper, already in the file); return early setting `editEmailDomainError` if invalid.
2. If password is non-empty and `< 8` characters, set `editError` and return early.
3. Build a diff object — only include a field if it differs from the original `editTarget` value. Password is never present in `editTarget`, so include it if non-empty.
4. If the diff is empty (nothing changed), close the dialog without making a network request.
5. Call `setIsSaving(true)`, call `PATCH /api/users/{editTarget.id}` with the diff body.
6. On success (2xx): toast "User updated", close dialog, call `fetchUsers()` to refresh the table.
7. On error: set `editError` to the API's `error` message; keep dialog open.
8. Finally: call `setIsSaving(false)`.

**Save button:** Disabled while `isSaving` is true; shows `<Loader2 className="h-4 w-4 animate-spin mr-2" />` inline when loading — same pattern as Create User button in Add dialog.

**Dialog close (`onOpenChange`):** Clears `editTarget`, `editError`, `editEmailDomainError`, and resets `editForm` to the empty default.

---

## 2. New Route — `GET /api/users/me`

**File:** `app/api/users/me/route.ts`

Returns the caller's `id` so the client component can detect self-editing without exposing other session data.

```ts
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(_request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ id: user.id });
}
```

---

## 3. API Changes — `PATCH /api/users/[id]`

**File:** `app/api/users/[id]/route.ts`

The existing PATCH handler accepts `{ role?, is_active? }`. Extend the body type cast — widen `role` to `string` so the runtime validation guard is meaningful:

```ts
const body = await request.json() as {
  full_name?: string;
  email?: string;
  password?: string;
  role?: string;       // typed as string (not the union) so the runtime guard below is not a no-op
  is_active?: boolean;
};
```

Also hoist `adminClient` to a single declaration before the field-handling blocks so it is not re-instantiated for each changed field:

```ts
const adminClient = createSupabaseAdminClient();
```

### Self-role-change guard

Added immediately after resolving `id` from params, before any field processing. Self-PATCH for `full_name`, `email`, and `password` is explicitly **allowed**; only `role` on self is blocked.

```ts
if (body.role !== undefined && id === caller.id) {
  return NextResponse.json({ error: "You cannot change your own role." }, { status: 400 });
}
```

### Role validation guard

```ts
if (body.role !== undefined && !["admin", "user"].includes(body.role)) {
  return NextResponse.json({ error: "Invalid role." }, { status: 400 });
}
```

### Field handling (in order)

**`full_name`** — write to `profiles` table. The `handle_new_user` trigger is insert-only; `profiles.full_name` is the canonical source of truth for display name after initial creation. Also sync `user_metadata` so the auth record stays consistent:

```ts
if (body.full_name !== undefined) {
  const { error } = await supabase.from("profiles").update({ full_name: body.full_name }).eq("id", id);
  if (error) throw error;
  const { error: authErr } = await adminClient.auth.admin.updateUserById(id, {
    user_metadata: { full_name: body.full_name },
  });
  if (authErr) throw authErr;
}
```

**`email`** — server-side domain validation, then `adminClient.auth.admin.updateUserById`:

```ts
if (body.email !== undefined) {
  const domain = body.email.split("@")[1]?.toLowerCase();
  if (!["americanapartners.com", "nonzeroai.com"].includes(domain ?? "")) {
    return NextResponse.json({ error: "Domain not allowed" }, { status: 400 });
  }
  const { error } = await adminClient.auth.admin.updateUserById(id, {
    email: body.email.trim().toLowerCase(),
  });
  if (error) throw error;
}
```

**`password`** — minimum 8 characters, then `adminClient.auth.admin.updateUserById`:

```ts
if (body.password !== undefined) {
  if (body.password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }
  const { error } = await adminClient.auth.admin.updateUserById(id, { password: body.password });
  if (error) throw error;
}
```

**`role`** — existing logic unchanged: update `profiles.role` + sync `app_metadata` JWT via `updateUserById`.

**`is_active`** — existing logic unchanged.

### Error handling

All Supabase errors `throw` and are caught by the outer try/catch, which returns 500 `{ error: "Failed to update user" }`. Validation errors return 400 with a specific message before any writes occur.

> **Note on email changes:** `adminClient.auth.admin.updateUserById` with a new email bypasses email confirmation by default. If the Supabase project has "Secure email change" enabled, the old address remains active until the user confirms the change. The admin panel will continue showing the updated email (from the request body), but the Supabase auth record may not reflect it until confirmed. This project currently has "Secure email change" disabled, so updates take effect immediately.

---

## 4. Files Changed

| File | Change |
|---|---|
| `components/users/users-table.tsx` | Add `EditForm` type, edit state, `handleEdit`, Edit dialog; remove `toggleRole` function and button; add `Pencil` import |
| `app/api/users/[id]/route.ts` | Extend PATCH: self-role guard, role validation, `full_name`/`email`/`password` handling with error capture |
| `app/api/users/me/route.ts` | New — `GET` returns `{ id }` for the current caller |

---

## 5. Out of Scope

- Admins editing their own role (explicitly blocked at API level)
- Any user editing their own profile outside the Settings admin panel
- Audit log of who changed what
- Re-sending verification emails after email change
