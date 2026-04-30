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
