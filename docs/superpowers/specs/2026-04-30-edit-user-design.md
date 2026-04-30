# Edit User — Design Spec

_Date: 2026-04-30_

## Overview

Admins can edit any user's full name, email, password, and role from the Settings page. A pencil icon on each row opens a pre-populated Edit User dialog. The existing "Make Admin / Make User" toggle button is removed — role is now managed exclusively in the edit dialog.

Admins may edit their own name, email, and password, but the role field is disabled when editing one's own account (self-demotion prevention). Any admin may change another admin's role.

---

## 1. UI Changes — `components/users/users-table.tsx`

### Actions column

- Remove the "Make Admin / Make User" `toggleRole` button and the `toggleRole` function.
- Actions column becomes two buttons per row: **Edit** (pencil icon, `Pencil` from lucide-react) and **Remove** (trash icon, existing).

### New state

```ts
const [editTarget, setEditTarget] = useState<UserRow | null>(null);
const [editForm, setEditForm] = useState<EditForm>({ full_name: "", email: "", password: "", role: "user" });
const [editError, setEditError] = useState<string | null>(null);
const [editEmailDomainError, setEditEmailDomainError] = useState<string | null>(null);
const [isSaving, setIsSaving] = useState(false);
const [currentUserId, setCurrentUserId] = useState<string | null>(null);
```

`currentUserId` is fetched once on mount via `fetch("/api/users/me")` — a new lightweight route that returns the caller's id — so the component knows whether to disable the role picker.

### Edit dialog

**Trigger:** Clicking the pencil icon sets `editTarget` to the row's user and pre-populates `editForm` with `{ full_name: user.full_name ?? "", email: user.email, password: "", role: user.role }`.

**Fields:**

| Field | Type | Validation |
|---|---|---|
| Full Name | text | Optional |
| Email | email | Same domain check as Add: `@americanapartners.com` or `@nonzeroai.com`; inline error on blur, blocked on submit |
| Password | password | Optional — only sent if non-empty. If non-empty, must be ≥ 8 characters. Placeholder: "Leave blank to keep current password" |
| Role | User / Admin segmented control | Disabled (greyed out) when `editTarget.id === currentUserId`. Note shown: "You cannot change your own role." |

**Submit logic (`handleEdit`):**

1. Client-side domain check on email; client-side length check on password if non-empty.
2. Build a diff object — only include `full_name`, `email`, `password`, `role` if they differ from the original value (password is always omitted from the original; include it if non-empty).
3. If the diff is empty, close the dialog without making a request.
4. Call `PATCH /api/users/{id}` with the diff body.
5. On success: toast "User updated", close dialog, update local state row.
6. On error: show inline error banner inside the dialog.

**Dialog close:** Clears `editError`, `editEmailDomainError`, and resets `editForm`.

---

## 2. New Route — `GET /api/users/me`

**File:** `app/api/users/me/route.ts`

Simple read-only endpoint that returns the caller's id. Used by the client component to know its own identity without exposing other profile data.

```ts
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

The existing PATCH handler accepts `{ role?, is_active? }`. Extend the accepted body to `{ full_name?, email?, password?, role?, is_active? }`.

### Self-role-change guard

Before applying any updates:

```ts
if (body.role !== undefined && id === caller.id) {
  return NextResponse.json({ error: "You cannot change your own role." }, { status: 400 });
}
```

### Field handling

**`full_name`** — update `profiles` table via the regular server client:
```ts
if (body.full_name !== undefined) {
  await supabase.from("profiles").update({ full_name: body.full_name }).eq("id", id);
}
```

**`email`** — server-side domain validation, then `adminClient.auth.admin.updateUserById`:
```ts
if (body.email !== undefined) {
  const domain = body.email.split("@")[1]?.toLowerCase();
  if (!["americanapartners.com", "nonzeroai.com"].includes(domain ?? "")) {
    return NextResponse.json({ error: "Domain not allowed" }, { status: 400 });
  }
  await adminClient.auth.admin.updateUserById(id, { email: body.email.trim().toLowerCase() });
}
```

**`password`** — minimum 8 characters, then `adminClient.auth.admin.updateUserById`:
```ts
if (body.password !== undefined) {
  if (body.password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }
  await adminClient.auth.admin.updateUserById(id, { password: body.password });
}
```

**`role`** — existing logic unchanged (update `profiles.role` + sync `app_metadata` JWT).

### Error handling

Any Supabase error from admin calls throws and is caught by the outer try/catch, returning 500 `{ error: "Failed to update user" }`. Validation errors return 400 with a specific message.

---

## 4. Files Changed

| File | Change |
|---|---|
| `components/users/users-table.tsx` | Add Edit dialog + state; remove `toggleRole` button |
| `app/api/users/[id]/route.ts` | Extend PATCH to handle `full_name`, `email`, `password`; add self-role-change guard |
| `app/api/users/me/route.ts` | New — returns `{ id }` for the current caller |

---

## 5. Out of Scope

- Admins editing their own role (explicitly blocked)
- Any user editing their own profile outside the Settings admin panel
- Email verification flow after email change (Supabase admin `updateUserById` updates email without a confirmation email by default)
- Audit log of who changed what
