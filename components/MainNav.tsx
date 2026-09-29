"use client";

import Link from "next/link";
import { LayoutDashboard, BedDouble, Coffee, BrushCleaning, CalendarDays, ClipboardCheck, Palmtree, Wallet, FileText } from "lucide-react";
const icons = { "/dashboard": LayoutDashboard, "/operations": BedDouble, "/breakfast": Coffee, "/housekeeping": BrushCleaning, "/events": CalendarDays, "/tasks": ClipboardCheck, "/tours": Palmtree, "/income": Wallet, "/reports": FileText };
import { usePathname } from "next/navigation";

export type NavItem = { label: string; href: string; enabled: boolean };

export function MainNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="main-nav" aria-label="Navegación principal">
      {items.map((item) => { const Icon = icons[item.href as keyof typeof icons] ?? FileText; return (
        <Link
          key={item.label}
          className={!item.enabled ? "disabled" : pathname === item.href ? "active" : ""}
          href={item.enabled ? item.href : "#"}
          prefetch={item.enabled}
          aria-current={pathname === item.href ? "page" : undefined}
        >
          <Icon size={17} aria-hidden="true" /><span>{item.label}</span>
        </Link>
      );})}
    </nav>
  );
}
