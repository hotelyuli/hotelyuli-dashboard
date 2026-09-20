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

  // TEMPORARY DEBUG (revert to the generic Spanish message + remove this try/catch once
  // diagnosed): also catches a thrown error from createClient()/serverEnv() (e.g. a missing
  // or invalid env var rejected by the Zod schema) so it surfaces instead of silently
  // becoming an opaque Next.js error boundary. redirect() is deliberately kept OUTSIDE this
  // try block: Next.js implements redirect() by throwing internally, and a catch-all here
  // would otherwise swallow that throw and break the redirect on a successful login.
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error) {
      console.error("[login debug]", error.toJSON());
      return { error: `DEBUG name=${error.name} status=${error.status} code=${error.code} message=${error.message}` };
    }
  } catch (thrown) {
    console.error("[login debug] threw", thrown);
    const message = thrown instanceof Error ? thrown.message : String(thrown);
    return { error: `DEBUG THREW: ${message}` };
  }
  redirect("/dashboard");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
