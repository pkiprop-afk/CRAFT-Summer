"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  LayoutGrid,
  ListChecks,
  Play,
  Layers,
  BarChart2,
  Download,
  FileText,
  BookMarked,
  ScrollText,
  NotebookPen,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";
import { useReviewMode } from "@/components/review/ReviewModeContext";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Dispatches model calls or writes to the run record — hidden under REVIEW_MODE. */
  mutating?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

type NavEntry = { kind: "item"; item: NavItem } | { kind: "group"; group: NavGroup };

const item = (i: NavItem): NavEntry => ({ kind: "item", item: i });

const NAV_ENTRIES: NavEntry[] = [
  item({ label: "CRAFT Framework", href: "/", icon: BookOpen }),
  item({ label: "Task Library", href: "/tasks", icon: LayoutGrid }),
  item({ label: "Progress", href: "/progress", icon: ListChecks }),
  item({ label: "Prompt Runner", href: "/run", icon: Play, mutating: true }),
  item({ label: "Batch Runner", href: "/batch", icon: Layers, mutating: true }),
  item({ label: "Results", href: "/results", icon: BarChart2 }),
  {
    kind: "group",
    group: {
      label: "Documents",
      items: [
        { label: "Paper", href: "/paper", icon: FileText },
        { label: "Proposal", href: "/proposal", icon: ScrollText },
        { label: "Reflection", href: "/reflection", icon: NotebookPen },
        { label: "References", href: "/references", icon: BookMarked },
      ],
    },
  },
  item({ label: "Export", href: "/export", icon: Download }),
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  navItem,
  active,
  nested = false,
}: {
  navItem: NavItem;
  active: boolean;
  nested?: boolean;
}) {
  const Icon = navItem.icon;
  return (
    <Link
      href={navItem.href}
      title={navItem.label}
      aria-current={active ? "page" : undefined}
      className={`flex items-center justify-center md:justify-start gap-3 rounded-lg py-2 text-sm font-medium transition-colors px-2 ${
        nested ? "md:pl-6 md:pr-3" : "md:px-3"
      } ${active ? "bg-cream text-navy-900" : "text-cream/80 hover:bg-white/10 hover:text-cream"}`}
    >
      <Icon size={18} strokeWidth={2} />
      <span className="hidden md:inline">{navItem.label}</span>
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const reviewMode = useReviewMode();
  // Open by default: the group exists to organise the nav, not to hide it.
  const [docsOpen, setDocsOpen] = useState(true);

  const entries = reviewMode
    ? NAV_ENTRIES.filter((e) => e.kind === "group" || !e.item.mutating)
    : NAV_ENTRIES;

  return (
    <aside className="w-16 md:w-60 shrink-0 bg-navy-900 text-cream flex flex-col">
      <div className="px-2 md:px-5 py-6 border-b border-white/10">
        <p className="hidden md:block text-sm font-semibold leading-tight">CRAFT Benchmark</p>
        <p className="hidden md:block text-xs text-cream/60 leading-tight mt-1">Peter Kiprop</p>
        {reviewMode ? (
          <p className="hidden md:block text-[10px] uppercase tracking-wide text-cream/50 leading-tight mt-2">
            Read-only archive
          </p>
        ) : null}
        <p className="md:hidden text-center text-sm font-semibold leading-tight">CB</p>
      </div>

      <nav className="flex-1 px-2 md:px-3 py-4 space-y-1">
        {entries.map((entry) => {
          if (entry.kind === "item") {
            return (
              <NavLink
                key={entry.item.href}
                navItem={entry.item}
                active={isActive(pathname, entry.item.href)}
              />
            );
          }

          const { group } = entry;
          const groupActive = group.items.some((i) => isActive(pathname, i.href));

          return (
            <div key={group.label} className="pt-2">
              {/* The toggle is md+ only: below that the rail shows icons with no
                  labels, so there is nothing to collapse and no visible control
                  to re-open it with. The children stay rendered there. */}
              <button
                type="button"
                onClick={() => setDocsOpen((o) => !o)}
                aria-expanded={docsOpen}
                className="hidden md:flex w-full items-center gap-1.5 rounded px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-cream/50 hover:text-cream/80"
              >
                <ChevronDown
                  size={12}
                  className={`transition-transform ${docsOpen ? "" : "-rotate-90"}`}
                />
                {group.label}
                {!docsOpen && groupActive ? (
                  <span className="ml-1 h-1.5 w-1.5 rounded-full bg-cream/70" aria-hidden />
                ) : null}
              </button>

              {/* Mobile marker for the same grouping, since the label is hidden. */}
              <div className="md:hidden mx-2 my-1 border-t border-white/10" aria-hidden />

              <div
                className={`space-y-1 md:border-l md:border-white/10 md:ml-3 ${
                  docsOpen ? "" : "md:hidden"
                }`}
              >
                {group.items.map((i) => (
                  <NavLink
                    key={i.href}
                    navItem={i}
                    active={isActive(pathname, i.href)}
                    nested
                  />
                ))}
              </div>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
