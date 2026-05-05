"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Settings, Activity, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/jobs", label: "Job History", icon: Activity },
  { href: "/admin", label: "Admin", icon: Settings, adminOnly: true },
];

export function Navbar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  return (
    <aside className="w-60 shrink-0 h-screen sticky top-0 bg-white border-r border-slate-200 flex flex-col">
      <div className="px-5 py-4 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
            <span className="text-white text-xs font-bold">CT</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">CompTrack</p>
            <p className="text-xs text-slate-400">E2E Networks</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map(({ href, label, icon: Icon, adminOnly }) => {
          if (adminOnly && user?.role !== "admin") return null;
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                active
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
              )}
            >
              <Icon size={16} className={active ? "text-blue-600" : "text-slate-400"} />
              {label}
            </Link>
          );
        })}
      </nav>

      {user && (
        <div className="px-3 py-4 border-t border-slate-200">
          <div className="flex items-center gap-2.5 px-2 py-2 mb-1">
            {user.picture ? (
              <img src={user.picture} alt="" className="w-7 h-7 rounded-full" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-medium text-slate-600">
                {user.name[0]}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">{user.name}</p>
              <p className="text-xs text-slate-400 truncate">{user.role}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      )}
    </aside>
  );
}
