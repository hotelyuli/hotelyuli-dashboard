"use server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/features/auth/logic/guards";
import { can, type AppRole } from "@/features/auth/logic/permissions";
export async function saveReportSnapshot(raw: {kind:string;date:string;locale:string;text:string}) {
 try {
  const input=z.object({kind:z.enum(["breakfast","housekeeping"]),date:z.string().date(),locale:z.enum(["en","es"]),text:z.string().min(1).max(50000)}).parse(raw);
  const {supabase,user}=await requireSession();
  const {data:profile}=await supabase.from("profiles").select("hotel_id,role,active").eq("id",user.id).single();
  if(!profile?.active || !can(profile.role as AppRole,"operations:write")) return {ok:false};
  const {error}=await supabase.from("report_snapshots").insert({hotel_id:profile.hotel_id,operation_date:input.date,report_kind:input.kind,locale:input.locale,report_text:input.text,content_hash:createHash("sha256").update(input.text).digest("hex"),created_by:user.id});
  if(error && error.code!=="23505") return {ok:false};
  revalidatePath(`/${input.kind}`);
  return {ok:true};
 }catch{return {ok:false};}
}
