import { can, type AppRole } from "@/features/auth/logic/permissions";
import { REPLY_GENERATOR_URL } from "@/lib/external-links";
import { dictionary, type Locale } from "@/lib/i18n";

export type NavItem = { label: string; href: string; enabled: boolean; external?: boolean };

/** Main navigation. Management-only items (owner and manager: the audit:view capability) need an active profile. */
export function mainNavItems(locale: Locale, profile: { role: string; active: boolean } | null): NavItem[] {
  const t = dictionary(locale);
  const management = Boolean(profile?.active) && can(profile!.role as AppRole, "audit:view");
  return [
    { label: t.dashboard, href: "/dashboard", enabled: true },
    { label: t.operations, href: "/operations", enabled: true },
    { label: t.breakfast, href: "/breakfast", enabled: true },
    { label: t.housekeeping, href: "/housekeeping", enabled: true },
    { label: t.events, href: "/events", enabled: true },
    { label: t.tasks, href: "/tasks", enabled: true },
    { label: t.tours, href: "/tours", enabled: true },
    { label: t.income, href: "/income", enabled: true },
    { label: locale === "es" ? "Reportes" : "Reports", href: "/reports", enabled: true },
    { label: locale === "es" ? "Proveedores" : "Contacts", href: "/contacts", enabled: true },
    ...(management ? [{ label: t.replyGenerator, href: REPLY_GENERATOR_URL, enabled: true, external: true }] : [])
  ];
}
