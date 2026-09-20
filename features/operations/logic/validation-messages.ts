/**
 * Translates the internal row-validation codes from reservation-normalizer.ts
 * and materialize-after-import.ts into the Spanish messages shown to
 * reception, per the standing rule: Spanish operational UI, English reports.
 * Never includes guest names — only column/date/room identifiers.
 */
const KNOWN_MESSAGES: Record<string, string> = {
  MISSING_REQUIRED_FIELDS: "Faltan columnas obligatorias (habitación, fecha o noches de estadía).",
  INVALID_ARRIVAL_DATE: "La fecha de llegada no se reconoce.",
  INVALID_DEPARTURE_DATE: "La fecha de salida no se reconoce.",
  INVALID_LOS: "El número de noches (LoS) no es válido.",
  UNRESOLVED_ROOM: "No se reconoce la habitación indicada."
};

export function translateRowWarning(message: string): string {
  if (message in KNOWN_MESSAGES) return KNOWN_MESSAGES[message];
  if (message.startsWith("UNMATCHED_ROOM_TOKEN:")) return `No se reconoce la habitación "${message.slice("UNMATCHED_ROOM_TOKEN:".length)}".`;
  if (message.startsWith("UNKNOWN_ROOM_CODE:")) return `La habitación "${message.slice("UNKNOWN_ROOM_CODE:".length)}" no existe en este hotel.`;
  if (message.startsWith("SAVE_FAILED:")) return "No se pudo guardar esta fila (error de base de datos).";
  return "Fila no reconocida.";
}

export function formatRowWarning(row: number, message: string): string {
  return `Fila ${row + 1}: ${translateRowWarning(message)}`;
}
