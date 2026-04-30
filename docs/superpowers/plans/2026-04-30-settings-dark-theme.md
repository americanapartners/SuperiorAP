# Settings Panel + Dark Theme Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dark theme toggle to the sidebar and replace the Users page with a Settings page that lets admins create users (with password) and permanently remove them.

**Architecture:** Dark mode is CSS-variable-driven via a `class="dark"` toggle on `<html>`, persisted in localStorage, read on mount via `useEffect`. The Settings page is the existing `/users` route renamed and extended — no new routes. User creation uses Supabase Admin `createUser`; removal uses `deleteUser` with an ON DELETE CASCADE to clean up profiles.

**Tech Stack:** Next.js 16 (App Router), React, Tailwind CSS v4, shadcn/ui, Supabase (SSR + Admin client), TypeScript.

**Spec:** `docs/superpowers/specs/2026-04-30-settings-dark-theme-design.md`

---

## Chunk 1: CSS Foundation + Layout

### Task 1: Fix the dark variant selector and update dark tokens

**Files:**
- Modify: `app/globals.css` (lines 5 and 86–118)

The current `@custom-variant dark (&:is(.dark *))` only matches children of `.dark`. Since we put `class="dark"` on `<html>`, the `<html>` element itself never gets the token overrides. Changing to `(&:is(.dark, .dark *))` fixes this.

- [ ] **Step 1.1 — Fix the variant selector (line 5)**

Replace line 5 of `app/globals.css`:

```css
/* BEFORE */
@custom-variant dark (&:is(.dark *));

/* AFTER */
@custom-variant dark (&:is(.dark, .dark *));
```

- [ ] **Step 1.2 — Update the `.dark` block tokens**

Replace only the tokens listed below inside the existing `.dark { … }` block. Leave all other tokens (`--popover`, `--secondary`, `--accent`, `--destructive`, `--ring`, `--chart-*`, `--sidebar-foreground`, `--sidebar-primary-foreground`, `--sidebar-accent-foreground`, `--sidebar-ring`) untouched.

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

After editing, the `.dark` block should look like:

```css
.dark {
  --background: oklch(0.067 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.1 0 0);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.205 0 0);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.72 0.1 75);
  --primary-foreground: oklch(0.1 0 0);
  --secondary: oklch(0.269 0 0);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.18 0 0);
  --muted-foreground: oklch(0.6 0 0);
  --accent: oklch(0.269 0 0);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(0.55 0.08 75 / 20%);
  --input: oklch(1 0 0 / 8%);
  --ring: oklch(0.556 0 0);
  --chart-1: oklch(0.87 0 0);
  --chart-2: oklch(0.556 0 0);
  --chart-3: oklch(0.439 0 0);
  --chart-4: oklch(0.371 0 0);
  --chart-5: oklch(0.269 0 0);
  --sidebar: oklch(0.1 0 0);
  --sidebar-foreground: oklch(0.985 0 0);
  --sidebar-primary: oklch(0.72 0.1 75);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.15 0 0);
  --sidebar-accent-foreground: oklch(0.985 0 0);
  --sidebar-border: oklch(0.55 0.08 75 / 15%);
  --sidebar-ring: oklch(0.556 0 0);
}
```

### Task 2: Add suppressHydrationWarning to layout

**Files:**
- Modify: `app/layout.tsx` (line 27)

The dark class is added by JavaScript after hydration. Without this attribute, React logs a mismatch warning because the server renders `<html>` without the class and the client adds it.

- [ ] **Step 2.1 — Add the attribute**

In `app/layout.tsx`, add `suppressHydrationWarning` to the `<html>` element:

```tsx
<html
  lang="en"
  suppressHydrationWarning
  className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
>
```

- [ ] **Step 2.2 — Commit**

```bash
git add app/globals.css app/layout.tsx
git commit -m "feat: update dark theme tokens and fix CSS variant selector"
```

---

## Chunk 2: Sidebar Dark Mode Toggle

### Task 3: Add the dark mode toggle and rename Settings nav item

**Files:**
- Modify: `components/layout/sidebar.tsx`

The sidebar is already `"use client"`. We add a `useEffect` to read `localStorage.theme` on mount and apply the class, a `toggleDark` handler, and a toggle UI in the footer. We also rename the "Users" nav item to "Settings" and swap the icon.

- [ ] **Step 3.1 — Update the full sidebar component**

Replace the entire contents of `components/layout/sidebar.tsx` with:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { FileText, Users, History, Settings, LogOut, Moon, Sun } from "lucide-react";
import { signOut } from "@/app/actions/auth";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const baseNavigation = [
  { name: "AP Aging Detail", href: "/", icon: FileText },
  { name: "Clients", href: "/clients", icon: Users },
];

const adminNavigation = [
  { name: "History", href: "/history", icon: History },
  { name: "Settings", href: "/users", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [userInfo, setUserInfo] = useState<{ name: string; email: string; role: string } | null>(null);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Apply persisted theme on mount
    const stored = localStorage.getItem("theme");
    const dark = stored === "dark";
    setIsDark(dark);
    if (dark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, []);

  const toggleDark = () => {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  };

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
      <div className="border-t p-4 space-y-1">
        <div className="mb-3 px-2">
          <p className="text-sm font-medium text-foreground truncate">{userInfo?.name ?? "Loading…"}</p>
          <p className="text-xs text-muted-foreground truncate">{userInfo?.email ?? ""}</p>
          {isAdmin && (
            <span className="text-xs text-amber-600 font-medium">Admin</span>
          )}
        </div>
        <button
          onClick={toggleDark}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          type="button"
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          {isDark ? "Light mode" : "Dark mode"}
        </button>
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

- [ ] **Step 3.2 — Manual check**

Start the dev server (`npm run dev`), sign in, and verify:
- Sidebar shows "Settings" instead of "Users" for admin accounts.
- Clicking "Dark mode" toggles the theme and the icon changes to "Light mode".
- Refreshing the page preserves the theme choice.
- The dark theme uses black background with gold primary buttons.

- [ ] **Step 3.3 — Commit**

```bash
git add components/layout/sidebar.tsx
git commit -m "feat: add dark mode toggle to sidebar, rename Users nav to Settings"
```

---

## Chunk 3: Add User Dialog

### Task 4: Replace the Invite dialog with Add User in users-table.tsx

**Files:**
- Modify: `components/users/users-table.tsx`

Remove `handleInvite`, `isInviteOpen`, `inviteEmail`, `isInviting` state and the invite `Dialog`. Add `isAddOpen`, `addForm` state, `handleAdd`, and a new dialog with email / full name / password / role fields plus domain validation.

The `toggleActive` function and "Activate"/"Deactivate" buttons are removed from the component (Chunk 4 will add "Remove" instead).

- [ ] **Step 4.1 — Replace users-table.tsx**

Replace the entire contents of `components/users/users-table.tsx` with:

```tsx
"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { UserPlus, Loader2, ShieldCheck, User, Trash2 } from "lucide-react";
import { toast } from "sonner";

const ALLOWED_DOMAINS = ["americanapartners.com", "nonzeroai.com"];

interface UserRow {
  id: string;
  email: string;
  full_name: string | null;
  role: "admin" | "user";
  is_active: boolean;
  created_at: string;
}

interface AddForm {
  email: string;
  full_name: string;
  password: string;
  role: "admin" | "user";
}

function domainError(email: string): string | null {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return null;
  return ALLOWED_DOMAINS.includes(domain)
    ? null
    : `Only ${ALLOWED_DOMAINS.join(" and ")} emails are allowed.`;
}

export function UsersTable() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Add user dialog state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<AddForm>({ email: "", full_name: "", password: "", role: "user" });
  const [addError, setAddError] = useState<string | null>(null);
  const [emailDomainError, setEmailDomainError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  // Remove user dialog state
  const [removeTarget, setRemoveTarget] = useState<UserRow | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  useEffect(() => { fetchUsers(); }, []);

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/users");
      if (!res.ok) throw new Error();
      setUsers(await res.json());
    } catch {
      toast.error("Failed to load users");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const domErr = domainError(addForm.email);
    if (domErr) { setEmailDomainError(domErr); return; }
    if (addForm.password.length < 8) { setAddError("Password must be at least 8 characters."); return; }

    setIsAdding(true);
    setAddError(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: addForm.email.trim().toLowerCase(),
          full_name: addForm.full_name.trim() || undefined,
          password: addForm.password,
          role: addForm.role,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create user");
      toast.success(`User ${addForm.email} created`);
      setIsAddOpen(false);
      setAddForm({ email: "", full_name: "", password: "", role: "user" });
      fetchUsers();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    setIsRemoving(true);
    try {
      const res = await fetch(`/api/users/${removeTarget.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to remove user");
      toast.success(`${removeTarget.email} removed`);
      setRemoveTarget(null);
      setUsers((prev) => prev.filter((u) => u.id !== removeTarget.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove user");
    } finally {
      setIsRemoving(false);
    }
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
    } catch {
      toast.error("Failed to update role");
    }
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
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>User Management</CardTitle>
              <CardDescription>Add and manage who has access to this dashboard</CardDescription>
            </div>
            <Button onClick={() => { setAddError(null); setEmailDomainError(null); setIsAddOpen(true); }}>
              <UserPlus className="mr-2 h-4 w-4" /> Add User
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
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                        : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                    }`}>
                      {user.role === "admin" ? <ShieldCheck className="h-3 w-3" /> : <User className="h-3 w-3" />}
                      {user.role}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className={`text-xs font-medium ${user.is_active ? "text-green-600" : "text-muted-foreground"}`}>
                      {user.is_active ? "● Active" : "● Inactive"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => toggleRole(user)}>
                        {user.role === "admin" ? "Make User" : "Make Admin"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setRemoveTarget(user)}
                      >
                        <Trash2 className="h-4 w-4 mr-1" /> Remove
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Add User Dialog ── */}
      <Dialog open={isAddOpen} onOpenChange={(open) => { setIsAddOpen(open); if (!open) setAddError(null); }}>
        <DialogContent>
          <form onSubmit={handleAdd}>
            <DialogHeader>
              <DialogTitle>Add User</DialogTitle>
              <DialogDescription>
                Create credentials to share in person or via secure email.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              {addError && (
                <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
                  {addError}
                </p>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="add-email">Email</Label>
                <Input
                  id="add-email"
                  type="email"
                  value={addForm.email}
                  onChange={(e) => { setAddForm((f) => ({ ...f, email: e.target.value })); setEmailDomainError(null); }}
                  onBlur={() => setEmailDomainError(domainError(addForm.email))}
                  placeholder="name@americanapartners.com"
                  required
                />
                {emailDomainError && <p className="text-xs text-destructive">{emailDomainError}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="add-name">
                  Full Name <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Input
                  id="add-name"
                  type="text"
                  value={addForm.full_name}
                  onChange={(e) => setAddForm((f) => ({ ...f, full_name: e.target.value }))}
                  placeholder="e.g. Morgan Lee"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="add-password">Password</Label>
                <Input
                  id="add-password"
                  type="password"
                  value={addForm.password}
                  onChange={(e) => setAddForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="Min 8 characters"
                  required
                  minLength={8}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(["user", "admin"] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setAddForm((f) => ({ ...f, role: r }))}
                      className={`rounded-md border p-3 text-left transition-colors ${
                        addForm.role === r
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-input hover:border-muted-foreground"
                      }`}
                    >
                      <p className="text-sm font-semibold capitalize">{r}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {r === "user" ? "Upload & view reports" : "Full access + settings"}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isAdding}>
                {isAdding && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Create User
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Remove User Confirmation Dialog ── */}
      <Dialog open={!!removeTarget} onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove user?</DialogTitle>
            <DialogDescription>
              This will permanently remove <strong>{removeTarget?.email}</strong> from the dashboard.
              They will no longer be able to sign in. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveTarget(null)} disabled={isRemoving}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRemove} disabled={isRemoving}>
              {isRemoving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Remove User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 4.2 — Update the Settings page heading**

In `app/users/page.tsx`, update the page title and description. Read the current file first, then update the heading from "Users" to "Settings":

```tsx
<h1 className="text-3xl font-bold tracking-tight">Settings</h1>
<p className="text-muted-foreground mt-2">
  Manage users and application preferences
</p>
```

- [ ] **Step 4.3 — Manual check**

With `npm run dev`, sign in as admin and navigate to `/users`:
- Page heading reads "Settings".
- Card header reads "User Management" with an "Add User" button.
- Clicking "Add User" opens the dialog with all four fields.
- Entering a non-allowed domain (e.g. `@gmail.com`) and blurring the email field shows the domain error inline.
- Every row has a red "Remove" button.

- [ ] **Step 4.4 — Commit**

```bash
git add components/users/users-table.tsx app/users/page.tsx
git commit -m "feat: replace invite dialog with add user form, add remove button to all rows"
```

---

## Chunk 4: API — Create User + Delete User

### Task 5: Update POST /api/users to use createUser

**Files:**
- Modify: `app/api/users/route.ts`

Replace the existing `POST` handler. The `GET` handler stays unchanged.

- [ ] **Step 5.1 — Update the POST handler**

In `app/api/users/route.ts`, replace the `POST` export with:

```ts
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user: caller } } = await supabase.auth.getUser();
    if (!caller || caller.app_metadata?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { email, password, full_name, role } = await request.json() as {
      email: string;
      password: string;
      full_name?: string;
      role: "admin" | "user";
    };

    if (!email?.trim() || !password || !role) {
      return NextResponse.json({ error: "email, password, and role are required" }, { status: 400 });
    }

    const domain = email.split("@")[1]?.toLowerCase();
    if (!["americanapartners.com", "nonzeroai.com"].includes(domain)) {
      return NextResponse.json({ error: "Domain not allowed" }, { status: 400 });
    }

    const adminClient = createSupabaseAdminClient();
    const { data, error } = await adminClient.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name ?? "" },
      app_metadata: { role },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, userId: data.user.id }, { status: 201 });
  } catch (error) {
    console.error("Error creating user:", error);
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
  }
}
```

### Task 6: Add DELETE /api/users/[id]

**Files:**
- Modify: `app/api/users/[id]/route.ts` — add `DELETE` export alongside existing `PATCH`

- [ ] **Step 6.1 — Add the DELETE handler**

Append the following export to the end of `app/api/users/[id]/route.ts`:

```ts
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user: caller } } = await supabase.auth.getUser();
    if (!caller || caller.app_metadata?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    if (id === caller.id) {
      return NextResponse.json(
        { error: "You cannot remove your own account." },
        { status: 400 }
      );
    }

    const adminClient = createSupabaseAdminClient();
    const { error } = await adminClient.auth.admin.deleteUser(id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing user:", error);
    return NextResponse.json({ error: "Failed to remove user" }, { status: 500 });
  }
}
```

- [ ] **Step 6.2 — Manual check**

With `npm run dev`, sign in as admin:
- Open the Add User dialog, enter a valid email + password, select a role, and click "Create User".
- Verify the new user appears in the table immediately.
- Sign in as the new user in a separate browser / incognito window to confirm credentials work.
- Back as admin, click "Remove" on a non-self user, confirm the warning dialog, and click "Remove User".
- Verify the row disappears and a toast appears.
- Click "Remove" on your own account — verify the API returns an error toast ("You cannot remove your own account.").

- [ ] **Step 6.3 — Commit**

```bash
git add app/api/users/route.ts app/api/users/[id]/route.ts
git commit -m "feat: add createUser API and deleteUser API with self-deletion guard"
```

---

## Chunk 5: Deploy

- [ ] **Step 7.1 — Push to master and deploy**

```bash
git push origin master main
npx vercel --prod --scope americana-partners-projects
```

- [ ] **Step 7.2 — Smoke test on production**

- Visit `superior-ap.vercel.app`, sign in as admin.
- Toggle dark mode — verify the theme switches and persists on refresh.
- Navigate to Settings — verify the heading and "Add User" button appear.
- Create a test user, verify they can sign in.
- Remove the test user, verify the row disappears.
