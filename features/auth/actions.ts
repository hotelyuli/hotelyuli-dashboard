"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const loginSchema = z.object({
  email: z.string().email("Ingrese un correo electrónico válido."),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres.")
});

export type LoginState = { error?: string };

export async function login(_: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "No pudimos iniciar sesión. Revise sus datos." };
  redirect("/dashboard");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
