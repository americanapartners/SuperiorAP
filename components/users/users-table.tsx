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
