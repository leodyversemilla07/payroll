"use client";

import { cn } from "@workspace/ui/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const PROFILE_SETTINGS_ITEMS = [
  { id: "account", href: "/profile", label: "Account" },
  { id: "attendance", href: "/my-attendance", label: "Attendance" },
  { id: "security", href: "/security", label: "Security" },
];

export function ProfileSettingsNav() {
  const pathname = usePathname();
  const activeId =
    pathname === "/security"
      ? "security"
      : pathname === "/my-attendance"
        ? "attendance"
        : "account";

  return (
    <nav aria-label="Profile settings" className="lg:w-56 lg:shrink-0">
      <div className="lg:sticky lg:top-6">
        <h2 className="mb-2 px-3 text-base font-semibold tracking-tight">
          Profile
        </h2>
        <ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
          {PROFILE_SETTINGS_ITEMS.map((item) => (
            <li key={item.id} className="shrink-0">
              <Link
                href={item.href}
                aria-current={activeId === item.id ? "page" : undefined}
                className={cn(
                  "block rounded-lg px-3 py-2 text-sm transition-colors",
                  activeId === item.id
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

export function ProfileSettingsShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-6 lg:flex-row lg:gap-8">
      <ProfileSettingsNav />
      <div className="min-w-0 flex-1 space-y-6">{children}</div>
    </div>
  );
}
