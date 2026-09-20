import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Cormorant_Garamond, Inter } from "next/font/google";
import type { Locale } from "@/lib/i18n";
import "./globals.css";

const display = Cormorant_Garamond({ subsets: ["latin"], variable: "--font-display", weight: ["500", "600"] });
const sans = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: { default: "YuliOS", template: "%s · YuliOS" },
  description: "Hotel Yuli daily operations platform",
  icons: { icon: "/favicon.svg" }
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = ((await cookies()).get("yulios-locale")?.value ?? "es") as Locale;
  return <html lang={locale}><body className={`${display.variable} ${sans.variable}`}>{children}</body></html>;
}
