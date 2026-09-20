"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { formatInTimeZone } from "date-fns-tz";
import { z } from "zod";
import { requireSession } from "@/features/auth/logic/guards";
import { can } from "@/features/auth/logic/permissions";
import type { AppRole } from "@/features/auth/logic/permissions";
import { materializeAfterImport } from "@/features/operations/services/materialize-after-import";
import { formatRowWarning } from "@/features/operations/logic/validation-messages";

export type ImportState = { status: "idle" | "success" | "error"; message?: string; rowErrors?: string[] };

const importSchema = z.object({
  fileType: z.enum(["check_in", "check_out"]),
  fileName: z.string().trim().min(1).max(255),
  headers: z.array(z.string().trim().min(1).max(255)).min(1).max(100),
  rows: z.array(z.record(z.string(), z.string().max(5000))).max(2000),
});

export async function commitCsvImport(_state: ImportState, formData: FormData): Promise<ImportState> {
  const parsedJson = safeJson(formData.get("payload"));
  const parsed = importSchema.safeParse(parsedJson);
  if (!parsed.success) return { status: "error", message: "INVALID_CSV" };

  const { supabase, user } = await requireSession();
  const { data: profile } = await supabase.from("profiles").select("hotel_id, role, active").eq("id", user.id).single();
  if (!profile?.active || !can(profile.role as AppRole, "operations:write")) return { status: "error", message: "NOT_AUTHORIZED" };

  const operationDate = formatInTimeZone(new Date(), "America/Costa_Rica", "yyyy-MM-dd");
  const contentHash = createHash("sha256").update(JSON.stringify({ headers: parsed.data.headers, rows: parsed.data.rows })).digest("hex");
  const { data: inserted, error } = await supabase
    .from("reservation_imports")
    .insert({
      hotel_id: profile.hotel_id,
      operation_date: operationDate,
      file_type: parsed.data.fileType,
      file_name: parsed.data.fileName,
      content_hash: contentHash,
      row_count: parsed.data.rows.length,
      headers: parsed.data.headers,
      rows: parsed.data.rows,
      imported_by: user.id,
    })
    .select("id")
    .single();
  let sourceImportId = inserted?.id;
  let resultMessage = "SAVED";

  if (error?.code === "23505") {
    const { data: existingImport, error: existingImportError } = await supabase
      .from("reservation_imports")
      .select("id")
      .eq("hotel_id", profile.hotel_id)
      .eq("operation_date", operationDate)
      .eq("file_type", parsed.data.fileType)
      .eq("content_hash", contentHash)
      .single();

    if (existingImportError || !existingImport) return { status: "error", message: "SAVE_FAILED" };
    sourceImportId = existingImport.id;
    resultMessage = "DUPLICATE";
  } else if (error || !sourceImportId) {
    return { status: "error", message: "SAVE_FAILED" };
  }

  const { warnings } = await materializeAfterImport({
    supabase,
    hotelId: profile.hotel_id,
    operationDate,
    fileType: parsed.data.fileType,
    headers: parsed.data.headers,
    rows: parsed.data.rows,
    sourceImportId,
  });

  revalidatePath("/dashboard");
  revalidatePath("/operations");

  if (warnings.length) {
    return {
      status: "success",
      message: "SAVED_WITH_ROW_ERRORS",
      rowErrors: warnings.slice(0, 20).map((warning) => formatRowWarning(warning.row, warning.message)),
    };
  }
  return { status: "success", message: resultMessage };
}

function safeJson(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;
  try { return JSON.parse(value) as unknown; } catch { return null; }
}
