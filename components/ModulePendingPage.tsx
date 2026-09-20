import type { Locale } from "@/lib/i18n";

export function ModulePendingPage({ title, locale }: { title: string; locale: Locale }) {
  const es = locale === "es";
  return <main className="dashboard-page"><div className="page-heading"><div><p className="eyebrow">YULIOS</p><h1>{title}</h1><p>{es ? "El módulo ya tiene una ruta independiente. La base de datos y los formularios operativos se activarán en el siguiente módulo aprobado." : "This module now has its own route. Its database tables and operational forms will be activated in the next approved module."}</p></div></div><section className="module-pending"><strong>{es ? "Módulo preparado" : "Module prepared"}</strong><p>{es ? "La navegación funciona, pero todavía no se guardan registros en este módulo." : "Navigation works, but this module does not save records yet."}</p></section></main>;
}
