"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { label: string; href: string; enabled: boolean };

export function MainNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="main-nav" aria-label="Navegación principal">
      {items.map((item) => (
        <Link
          key={item.label}
          className={!item.enabled ? "disabled" : pathname === item.href ? "active" : ""}
          href={item.enabled ? item.href : "#"}
          prefetch={item.enabled}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
