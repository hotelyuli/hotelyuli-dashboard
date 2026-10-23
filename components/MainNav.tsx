"use client";

import Link from "next/link";
import { LayoutDashboard, BedDouble, Coffee, BrushCleaning, CalendarDays, ClipboardCheck, Palmtree, Wallet, FileText, MessageSquareReply, ExternalLink } from "lucide-react";
import { REPLY_GENERATOR_URL } from "@/lib/external-links";
import type { NavItem } from "@/components/nav-items";
const icons = { "/dashboard": LayoutDashboard, "/operations": BedDouble, "/breakfast": Coffee, "/housekeeping": BrushCleaning, "/events": CalendarDays, "/tasks": ClipboardCheck, "/tours": Palmtree, "/income": Wallet, "/reports": FileText, [REPLY_GENERATOR_URL]: MessageSquareReply };
import { usePathname } from "next/navigation";

export type { NavItem };

export function MainNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="main-nav" aria-label="Navegación principal">
      {items.map((item) => { const Icon = icons[item.href as keyof typeof icons] ?? FileText; return item.external ? (
        // Leaves YuliOS: a new tab (in the installed app, the browser), never an iframe.
        <a key={item.label} className="external" href={item.href} target="_blank" rel="noopener noreferrer">
          <Icon size={17} aria-hidden="true" /><span className="nav-label">{item.label}<ExternalLink className="external-icon" size={12} aria-hidden="true" /></span>
        </a>
      ) : (
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
