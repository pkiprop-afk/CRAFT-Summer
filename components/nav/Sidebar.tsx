"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, LayoutGrid, Play, BarChart2, Download, type LucideIcon } from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { label: "CRAFT Framework", href: "/", icon: BookOpen },
  { label: "Task Library", href: "/tasks", icon: LayoutGrid },
  { label: "Prompt Runner", href: "/run", icon: Play },
  { label: "Results", href: "/results", icon: BarChart2 },
  { label: "Export", href: "/export", icon: Download },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 shrink-0 bg-navy-900 text-cream flex flex-col">
      <div className="px-5 py-6 border-b border-white/10">
        <p className="text-sm font-semibold leading-tight">CRAFT Benchmark</p>
        <p className="text-xs text-cream/60 leading-tight mt-1">Peter Kiprop</p>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-cream text-navy-900"
                  : "text-cream/80 hover:bg-white/10 hover:text-cream"
              }`}
            >
              <Icon size={18} strokeWidth={2} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
