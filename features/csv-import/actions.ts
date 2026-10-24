"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { formatInTimeZone } from "date-fns-tz";
import { z } from "zod";
import { requireSession } from "@/features/auth/logic/guards";
import { can } from "@/features/auth/logic/permissions";
import type { AppRole } from "@/features/auth/logic/permissions";
import { materializeAfterImport, materializeBoardForDate } from "@/features/operations/services/materialize-after-import";
import { seenFromImport } from "@/features/csv-import/logic/import-seen";
import { retireMissingFromImport, type RetirementResult } from "@/features/operations/services/retirement";
import { runAction, type ActionResult } from "@/lib/action-result";
import { formatRowWarning } from "@/features/operations/logic/validation-messages";

/** `retirement`: what the import retired / flagged, or the list waiting for confirmation (migration 0032). */
export type ImportState = { status: "idle" | "success" | "error"; message?: string; rowErrors?: string[]; retirement?: { importId: string; result: RetirementResult } };

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

  const { warnings, retirement } = await materializeAfterImport({
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

  const retired = retirement && (retirement.candidates.length || retirement.skipped_dates.length || retirement.status === "skipped_file") ? { retirement: { importId: sourceImportId, result: retirement } } : {};
  if (warnings.length) {
    return {
      status: "success",
      message: "SAVED_WITH_ROW_ERRORS",
      rowErrors: warnings.slice(0, 20).map((warning) => formatRowWarning(warning.row, warning.message)),
      ...retired
    };
  }
  return { status: "success", message: resultMessage, ...retired };
}

/**
 * Staff ticked which of the import's candidates really are gone (`reservationIds`). Recomputes the
 * list from the stored file, retires / flags only those, and rebuilds the board for the import's day.
 */
export async function confirmImportRetirement(importId: string, reservationIds: string[]): Promise<ActionResult> {
  return runAction("confirmImportRetirement", async () => {
    const id = z.string().uuid().parse(importId);
    const ids = z.array(z.string().uuid()).min(1).max(200).parse(reservationIds);
    const { supabase, user } = await requireSession();
    const { data: profile } = await supabase.from("profiles").select("hotel_id, role, active").eq("id", user.id).single();
    if (!profile?.active || !can(profile.role as AppRole, "operations:write")) throw new Error("NOT_AUTHORIZED");
    const { data: file, error } = await supabase.from("reservation_imports").select("id, operation_date, file_type, headers, rows").eq("id", id).eq("hotel_id", profile.hotel_id).single();
    if (error || !file) throw new Error(`IMPORT_NOT_FOUND: ${error?.message ?? id}`);
    const { data: rooms } = await supabase.from("rooms").select("id, unit_code").eq("hotel_id", profile.hotel_id);
    const listed = seenFromImport(file.rows as Record<string, string>[], file.headers, file.file_type, new Map((rooms ?? []).map((room) => [room.unit_code, room.id])));
    const result = await retireMissingFromImport(supabase, { importId: id, fileType: file.file_type, ...listed, confirmIds: ids });
    if (!result) throw new Error("NOT_ENABLED: requiere migración 0032");
    if (result.status === "skipped_file") throw new Error("FILE_INCOMPLETE: el archivo tiene filas que no se pudieron leer");
    await materializeBoardForDate({ supabase, hotelId: profile.hotel_id, operationDate: file.operation_date });
    revalidatePath("/dashboard");
    revalidatePath("/operations");
  });
}

function safeJson(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;
  try { return JSON.parse(value) as unknown; } catch { return null; }
}
