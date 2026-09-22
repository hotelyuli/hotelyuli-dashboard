import { HotelClock } from "@/components/HotelClock";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { logout } from "@/features/auth/actions";
import { requireSession } from "@/features/auth/logic/guards";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { cookies } from "next/headers";
import { dictionary, type Locale } from "@/lib/i18n";
import { formatInTimeZone } from "date-fns-tz";
import { TeamHeader } from "@/features/staff/components/TeamHeader";
import { MainNav } from "@/components/MainNav";

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { supabase } = await requireSession();
  const cookieStore = await cookies();
  const locale = (cookieStore.get("yulios-locale")?.value ?? "es") as Locale;
  const shift = cookieStore.get("yulios-shift")?.value === "afternoon" ? "afternoon" : "morning";
  const t = dictionary(locale);
  const nav = [
    { label: t.dashboard, href: "/dashboard", enabled: true },
    { label: t.operations, href: "/operations", enabled: true },
    { label: t.breakfast, href: "/breakfast", enabled: true },
    { label: t.housekeeping, href: "/housekeeping", enabled: true },
    { label: t.events, href: "/events", enabled: true },
    { label: t.tasks, href: "/tasks", enabled: true },
    { label: t.tours, href: "/tours", enabled: true },
    { label: t.income, href: "/income", enabled: true },
    { label: locale === "es" ? "Reportes" : "Reports", href: "/reports", enabled: true },
    { label: locale === "es" ? "Proveedores" : "Contacts", href: "/contacts", enabled: true }
  ];
  const operationDate = formatInTimeZone(new Date(), "America/Costa_Rica", "yyyy-MM-dd");
  const { data: assignment } = await supabase.from("daily_staff_assignments").select("morning_receptionist, afternoon_receptionist, security_guard").eq("operation_date", operationDate).maybeSingle();
  const todaysAssignment = assignment ?? { morning_receptionist: "Grettel", afternoon_receptionist: "Rebeca", security_guard: "Yei Hernandez" };
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link href="/dashboard" className="wordmark"><span>Y</span><div><strong>Hotel Yuli</strong><small>YULIOS · OPERATIONS</small></div></Link>
        <HotelClock locale={locale} /><LanguageSwitcher locale={locale} />
        <TeamHeader locale={locale} shift={shift} assignment={todaysAssignment} />
        <form action={logout}><button className="icon-button" aria-label="Cerrar sesión"><LogOut size={18} /></button></form>
      </header>
      <MainNav items={nav} />
      {children}
    </div>
  );
}
