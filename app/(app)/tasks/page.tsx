import { cookies } from "next/headers";
import { ModulePendingPage } from "@/components/ModulePendingPage";
import type { Locale } from "@/lib/i18n";
export default async function TasksPage() { const locale = ((await cookies()).get("yulios-locale")?.value ?? "es") as Locale; return <ModulePendingPage title={locale === "es" ? "Tareas" : "Tasks"} locale={locale} />; }
