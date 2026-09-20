"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { z } from "zod";
import { requireSession } from "@/features/auth/logic/guards";
import { can } from "@/features/auth/logic/permissions";
import type { AppRole } from "@/features/auth/logic/permissions";

const assignmentSchema = z.object({
  morningReceptionist: z.string().trim().min(2).max(120),
  afternoonReceptionist: z.string().trim().min(2).max(120),
  securityGuard: z.string().trim().min(2).max(120),
});

export async function saveDailyTeam(formData: FormData) {
  const { supabase, user } = await requireSession();
  const parsed = assignmentSchema.safeParse({
    morningReceptionist: formData.get("morningReceptionist"),
    afternoonReceptionist: formData.get("afternoonReceptionist"),
    securityGuard: formData.get("securityGuard"),
  });
  if (!parsed.success) throw new Error("Invalid staff assignment");

  const { data: profile } = await supabase
    .from("profiles")
    .select("hotel_id, role, active")
    .eq("id", user.id)
    .single();
  if (!profile?.active || !can(profile.role as AppRole, "operations:write")) {
    throw new Error("Not authorized");
  }

  const operationDate = formatInTimeZone(new Date(), "America/Costa_Rica", "yyyy-MM-dd");
  const { error } = await supabase.from("daily_staff_assignments").upsert({
    hotel_id: profile.hotel_id,
    operation_date: operationDate,
    morning_receptionist: parsed.data.morningReceptionist,
    afternoon_receptionist: parsed.data.afternoonReceptionist,
    security_guard: parsed.data.securityGuard,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  }, { onConflict: "hotel_id,operation_date" });
  if (error) throw new Error("Could not save today's team");

  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function setActiveShift(formData: FormData) {
  const shift = z.enum(["morning", "afternoon"]).parse(formData.get("shift"));
  const { cookies } = await import("next/headers");
  (await cookies()).set("yulios-shift", shift, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 18,
  });
  revalidatePath("/dashboard");
}
