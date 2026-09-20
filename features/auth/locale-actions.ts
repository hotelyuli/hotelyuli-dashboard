"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { locales, type Locale } from "@/lib/i18n";

export async function setLocale(formData: FormData) {
  const value = formData.get("locale") as Locale;
  if (!locales.includes(value)) return;
  const store = await cookies();
  store.set("yulios-locale", value, { sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 31_536_000 });
  revalidatePath("/", "layout");
}

