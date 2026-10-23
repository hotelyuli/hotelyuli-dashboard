import { HotelClock } from "@/components/HotelClock";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { logout } from "@/features/auth/actions";
import { requireSession } from "@/features/auth/logic/guards";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { cookies } from "next/headers";
import type { Locale } from "@/lib/i18n";
import { formatInTimeZone } from "date-fns-tz";
import { TeamHeader } from "@/features/staff/components/TeamHeader";
import { MainNav } from "@/components/MainNav";
import { mainNavItems } from "@/components/nav-items";
import { InstallAppButton, InstallPrompt } from "@/components/InstallPrompt";
import { NotificationsButton } from "@/components/NotificationsButton";
import { DEFAULT_TEAM } from "@/features/staff/receptionists";

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { supabase, user } = await requireSession();
  const cookieStore = await cookies();
  const locale = (cookieStore.get("yulios-locale")?.value ?? "es") as Locale;
  const shift = cookieStore.get("yulios-shift")?.value === "afternoon" ? "afternoon" : "morning";
  const { data: profile } = await supabase.from("profiles").select("role, active").eq("id", user.id).single();
  const nav = mainNavItems(locale, profile);
  const operationDate = formatInTimeZone(new Date(), "America/Costa_Rica", "yyyy-MM-dd");
  const { data: assignment } = await supabase.from("daily_staff_assignments").select("morning_receptionist, afternoon_receptionist, security_guard").eq("operation_date", operationDate).maybeSingle();
  const todaysAssignment = assignment ?? DEFAULT_TEAM;
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link href="/dashboard" className="wordmark"><span>Y</span><div><strong>Hotel Yuli</strong><small>YULIOS · OPERATIONS</small></div></Link>
        <HotelClock locale={locale} /><LanguageSwitcher locale={locale} />
        <TeamHeader locale={locale} shift={shift} assignment={todaysAssignment} />
        <InstallAppButton />
        <NotificationsButton locale={locale} />
        <form action={logout}><button className="icon-button" aria-label="Cerrar sesión"><LogOut size={18} /></button></form>
      </header>
      <MainNav items={nav} />
      {children}
      <InstallPrompt />
    </div>
  );
}
