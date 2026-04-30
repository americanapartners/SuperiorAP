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
