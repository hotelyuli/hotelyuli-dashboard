import { LoginForm } from "@/features/auth/components/LoginForm";
import { LoginLogo } from "@/features/auth/components/LoginLogo";
import { cookies } from "next/headers";
import { dictionary, type Locale } from "@/lib/i18n";

export const metadata = { title: "Iniciar sesión" };

export default async function LoginPage() {
  const locale = ((await cookies()).get("yulios-locale")?.value ?? "es") as Locale;
  const t = dictionary(locale);
  return (
    <main className="login-page">
      <section className="login-brand" aria-label="Hotel Yuli">
        <div className="brand-mark">Y</div>
        <p>HOTEL YULI</p>
        <h1>{t.brandLead}<br />{t.brandTail}</h1>
        <span>Uvita · Costa Rica</span>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <LoginLogo />
          <LoginForm messages={t} />
          <p className="login-help">{t.accessHelp}</p>
        </div>
      </section>
    </main>
  );
}
