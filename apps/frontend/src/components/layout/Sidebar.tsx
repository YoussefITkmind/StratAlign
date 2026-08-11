'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ComponentType } from 'react';
import {
  Target,
  LayoutGrid,
  Layers,
  BookOpen,
  Map,
  ChevronDown,
  ChevronRight,
  BarChart2,
  Rocket,
  LayoutDashboard,
  ShieldCheck,
  Database,
  Settings,
  LogOut,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Nav config — edit this array to add/rename/reorder pages. Every href below
// is a route that doesn't exist yet; until app/<route>/page.tsx is created,
// Next.js will render the blank not-found.tsx fallback for that link, and
// the sidebar itself will keep working normally.
// ---------------------------------------------------------------------------

type NavItem = {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  badge?: number;
};

type NavSection = {
  label: string;
  items: NavItem[];
  collapsible?: boolean;
};

export const NAV_SECTIONS: NavSection[] = [
  {
    label: 'MAIN',
    items: [{ label: 'Overview', href: '/overview', icon: LayoutGrid }],
  },
  {
    label: 'STRATEGY',
    collapsible: true,
    items: [
      { label: 'Strategy Hierarchy', href: '/strategy-hierarchy', icon: Layers },
      { label: 'Balanced Scorecards', href: '/balanced-scorecards', icon: BookOpen },
      { label: 'Strategy Maps', href: '/strategy-maps', icon: Map },
    ],
  },
  {
    label: 'EXECUTION',
    collapsible: true,
    items: [
      { label: 'KPIs & OKRs', href: '/kpis-okrs', icon: Target },
      { label: 'Initiatives & Projects', href: '/initiatives-projects', icon: Rocket },
    ],
  },
  {
    label: 'ANALYTICS',
    collapsible: true,
    items: [
      { label: 'Dashboards', href: '/dashboards', icon: LayoutDashboard },
      { label: 'Reports', href: '/reports', icon: BarChart2 },
    ],
  },
  {
    label: 'GOVERNANCE',
    collapsible: true,
    items: [{ label: 'Governance', href: '/governance', icon: ShieldCheck, badge: 3 }],
  },
  {
    label: 'SYSTEM',
    collapsible: true,
    items: [
      { label: 'Data & Integrations', href: '/data-integrations', icon: Database },
      { label: 'Settings', href: '/settings', icon: Settings },
    ],
  },
];

const CURRENT_USER = {
  initials: 'AM',
  name: 'Alex Morgan',
  role: 'Chief Strategy Officer',
};

export default function Sidebar({
  open = false,
  onClose,
}: {
  open?: boolean;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const toggleSection = (label: string) => {
    setCollapsedSections((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden"
          aria-hidden="true"
          onClick={onClose}
        />
      )}
      <aside
        className={`fixed inset-y-0 start-0 z-50 flex h-dvh w-72 max-w-[85vw] shrink-0 flex-col bg-[#0B2942] transition-transform duration-200 ease-out lg:static lg:z-auto lg:max-w-none lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full rtl:translate-x-full"
        }`}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#1E4F73]">
            <Target className="h-5 w-5 text-cyan-300" strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[15px] font-semibold text-white">StratAlign</div>
            <div className="truncate text-[10px] font-medium tracking-wider text-slate-400">
              ENTERPRISE
            </div>
          </div>
          <button
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            className="ml-auto shrink-0 rounded-lg p-1 text-slate-400 hover:text-white lg:hidden"
          >
            <ChevronRight className="h-5 w-5 rotate-180" />
          </button>
        </div>

      {/* Nav */}
      <nav className="sidebar-scroll flex-1 overflow-y-auto px-3 pb-4">
        {NAV_SECTIONS.map((section) => {
          const isCollapsed = collapsedSections[section.label];

          return (
            <div key={section.label} className="mb-1 mt-4 first:mt-0">
              <button
                type="button"
                onClick={() => section.collapsible && toggleSection(section.label)}
                className={`flex w-full items-center justify-between px-2.5 py-1 text-[11px] font-semibold tracking-wider text-slate-500 ${
                  section.collapsible ? 'cursor-pointer hover:text-slate-300' : 'cursor-default'
                }`}
              >
                <span>{section.label}</span>
                {section.collapsible &&
                  (isCollapsed ? (
                    <ChevronRight className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ))}
              </button>

              {!isCollapsed && (
                <ul className="mt-1 space-y-0.5">
                  {section.items.map((item) => {
                    const isActive = pathname === item.href;
                    const Icon = item.icon;

                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={onClose}
                          className={`group flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                            isActive
                              ? 'bg-[#12406B] text-white'
                              : 'text-slate-300 hover:bg-[#12365A] hover:text-white'
                          }`}
                        >
                          <Icon
                            className={`h-4 w-4 shrink-0 ${
                              isActive ? 'text-cyan-300' : 'text-slate-400 group-hover:text-cyan-300'
                            }`}
                          />
                          <span className="flex-1 truncate">{item.label}</span>
                          {item.badge ? (
                            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[11px] font-semibold text-white">
                              {item.badge}
                            </span>
                          ) : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer / current user */}
      <div className="flex items-center gap-3 border-t border-white/10 px-4 py-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cyan-600 text-sm font-semibold text-white">
          {CURRENT_USER.initials}
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-sm font-semibold text-white">{CURRENT_USER.name}</div>
          <div className="truncate text-xs text-slate-400">{CURRENT_USER.role}</div>
        </div>
        <button type="button" aria-label="Sign out" className="shrink-0 text-slate-500 hover:text-slate-300">
          <LogOut className="h-4 w-4" />
        </button>
      </div>
      </aside>
    </>
  );
}
