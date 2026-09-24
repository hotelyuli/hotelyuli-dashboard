import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Cormorant_Garamond, Inter } from "next/font/google";
import type { Locale } from "@/lib/i18n";
import "./globals.css";

const display = Cormorant_Garamond({ subsets: ["latin"], variable: "--font-display", weight: ["500", "600"] });
const sans = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: { default: "YuliOS", template: "%s · YuliOS" },
  description: "Hotel Yuli daily operations platform",
  // The "Y" logo: browser tab, and the phone home screen (apple-touch-icon + manifest icons, npm run icons).
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }, { url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }]
  },
  appleWebApp: { capable: true, title: "YuliOS", statusBarStyle: "default" }
};

export const viewport: Viewport = { themeColor: "#4d333e" };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = ((await cookies()).get("yulios-locale")?.value ?? "es") as Locale;
  return <html lang={locale}><body className={`${display.variable} ${sans.variable}`}>{children}</body></html>;
}
