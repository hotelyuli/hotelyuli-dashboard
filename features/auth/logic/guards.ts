import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AppRole, Capability } from "./permissions";
import { can } from "./permissions";

export async function requireSession() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export async function requireCapability(capability: Capability) {
  const { supabase, user } = await requireSession();
  const { data: profile } = await supabase
    .from("profiles")
    .select("hotel_id, role, active")
    .eq("id", user.id)
    .single();

  if (!profile?.active || !can(profile.role as AppRole, capability)) redirect("/dashboard");
  return { supabase, user, profile };
}
