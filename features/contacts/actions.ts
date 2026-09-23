"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/features/auth/logic/guards";
import { can, type AppRole } from "@/features/auth/logic/permissions";
import { normalizePhone } from "./logic";
import { runAction, type ActionResult } from "@/lib/action-result";
async function context() {
 const {supabase,user}=await requireSession();
 const {data:profile}=await supabase.from("profiles").select("hotel_id,role,active").eq("id",user.id).single();
 if(!profile?.active || !can(profile.role as AppRole,"operations:write")) throw Error("NOT_AUTHORIZED");
 return {supabase,user,profile};
}
export async function getContacts() {
 const {supabase,profile}=await context();
 const {data,error}=await supabase.from("supplier_contacts").select("id,name,category,phone,notes,operator_name").eq("hotel_id",profile.hotel_id).order("name");
 if(error) throw Error("CONTACTS_UNAVAILABLE");
 return data;
}
/** Create or edit a contact. Returns the real error instead of throwing (Next hides thrown messages). */
export async function saveContact(form:FormData): Promise<ActionResult> {
 return runAction("saveContact", async () => {
 const {supabase,user,profile}=await context();
 const d=z.object({id:z.string().uuid().or(z.literal("")),name:z.string().trim().min(1).max(120),category:z.enum(["maintenance","ac","pool","septic","supplies","tour","other"]),phone:z.string().transform(normalizePhone),notes:z.string().trim().max(500),operator_name:z.string().trim().max(120)}).parse(Object.fromEntries(form));
 const {id,...fields}=d;
 const payload={...fields,operator_name:d.category==="tour"?d.operator_name:"",updated_at:new Date().toISOString()};
 const result=id ? await supabase.from("supplier_contacts").update(payload).eq("id",id).eq("hotel_id",profile.hotel_id).select("id").single() : await supabase.from("supplier_contacts").insert({...payload,hotel_id:profile.hotel_id,created_by:user.id}).select("id").single();
 if(result.error) throw Error(`SAVE_FAILED: ${result.error.message}`);
 revalidatePath("/contacts"); revalidatePath("/tours"); revalidatePath("/events");
 });
}

/** Delete a contact of this hotel (RLS policy supplier_contacts_delete, migration 0026). */
export async function deleteContact(id:string): Promise<ActionResult> {
 return runAction("deleteContact", async () => {
  const {supabase,profile}=await context();
  const contactId=z.string().uuid().parse(id);
  const {data,error}=await supabase.from("supplier_contacts").delete().eq("id",contactId).eq("hotel_id",profile.hotel_id).select("id");
  if(error) throw Error(`DELETE_FAILED: ${error.message}`);
  if(!data?.length) throw Error("NOT_DELETED: the contact was not found, or deleting is not enabled yet (run migration 0026)");
  revalidatePath("/contacts"); revalidatePath("/tours"); revalidatePath("/events");
 });
}
