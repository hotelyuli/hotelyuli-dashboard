import { formatInTimeZone } from "date-fns-tz";
import { breakfastFromNotes } from "@/features/operations/logic/breakfast";
import { sanitize } from "@/features/reports/logic/whatsapp-text";
import { allocatePax, type PaxRow } from "@/features/operations/logic/pax";

/**
 * "Control de desayunos": the list for breakfast on date D, sent the day before.
 * A reservation eats on D when it arrived before D and has not left before D
 * (arrival < D <= departure): today's arrivals, stay-throughs and D's departures.
 * The text never carries amounts or currencies.
 */

export type ControlUnit = { roomId: string; roomNumber: string; unitType: "room" | "bunk"; parentRoomNumber: string | null; sortOrder: number; active: boolean };
export type ControlReservation = { id: string; reference?: string | null; roomId: string; guestName: string | null; arrivalDate: string; departureDate: string; adults: number; children: number; babies: number; notes: string | null };
/** A daily_operations row (D's or the previous day's). */
export type ControlDayRow = { roomId: string; reservationId: string | null; breakfastStatus: "included" | "not_included"; breakfastPax: number; breakfastToGo: boolean; breakfastToGoTime: string | null; breakfastNotes: string | null };

/** One listed guest line before merging Room 20 beds. */
export type ControlEntry = {
  room: string;
  beds: boolean;
  sortOrder: number;
  guestName: string | null;
  pax: number;
  breakfastIncluded: boolean;
  breakfastPax: number;
  toGo: boolean;
  toGoTime: string | null;
  notes: string | null;
  /** The booking, so a dorm stay spread over several beds counts its pax once. */
  reservationId?: string | null;
  reference?: string | null;
  arrivalDate?: string | null;
  departureDate?: string | null;
};

const WEEKDAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

export function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Little Hotelier's "Apellido, Nombre" -> "Nombre Apellido"; names without a comma are kept. */
export function displayGuestName(name: string) {
  const comma = name.indexOf(",");
  if (comma < 0) return name.trim().replace(/\s+/g, " ");
  const last = name.slice(0, comma).trim();
  const first = name.slice(comma + 1).trim();
  return [first, last].filter(Boolean).join(" ").replace(/\s+/g, " ");
}

const WEEKDAYS_LONG = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** "2026-10-03" -> "sábado 03/10/2026" (sheet header). */
export function controlLongDateLabel(isoDate: string) {
  const weekday = WEEKDAYS_LONG[new Date(`${isoDate}T00:00:00Z`).getUTCDay()];
  return `${weekday} ${isoDate.slice(8, 10)}/${isoDate.slice(5, 7)}/${isoDate.slice(0, 4)}`;
}

/** When the sheet was generated, in Costa Rica time: "jue 02/10/2026 · 12:40". */
export function generatedLabel(at: Date) {
  const [day, time] = formatInTimeZone(at, "America/Costa_Rica", "yyyy-MM-dd HH:mm").split(" ");
  return `${controlDateLabel(day)} · ${time}`;
}

/** "2026-09-30" -> "mié 30/09/2026" */
export function controlDateLabel(isoDate: string) {
  const weekday = WEEKDAYS[new Date(`${isoDate}T00:00:00Z`).getUTCDay()];
  return `${weekday} ${isoDate.slice(8, 10)}/${isoDate.slice(5, 7)}/${isoDate.slice(0, 4)}`;
}

export function eatsBreakfastOn(reservation: Pick<ControlReservation, "arrivalDate" | "departureDate">, date: string) {
  return reservation.arrivalDate < date && reservation.departureDate >= date;
}

/**
 * Breakfast fields come from D's daily_operations row when it exists, else the
 * previous day's row, for the same reservation. Breakfast-included then falls
 * back to the reservation notes; to-go, to-go time and breakfast notes have no
 * reservation-level source, so without either row they are empty.
 */
export function controlEntries(params: { date: string; units: ControlUnit[]; reservations: ControlReservation[]; dayRows: ControlDayRow[]; previousDayRows: ControlDayRow[] }): ControlEntry[] {
  const { date, units, reservations, dayRows, previousDayRows } = params;
  const unitById = new Map(units.map((unit) => [unit.roomId, unit]));
  const rowFor = (rows: ControlDayRow[], reservation: ControlReservation) => rows.find((row) => row.roomId === reservation.roomId && row.reservationId === reservation.id);

  return reservations.filter((reservation) => eatsBreakfastOn(reservation, date)).flatMap((reservation) => {
    const unit = unitById.get(reservation.roomId);
    if (!unit) return [];
    const row = rowFor(dayRows, reservation) ?? rowFor(previousDayRows, reservation);
    const fromNotes = breakfastFromNotes(reservation.notes, reservation.adults, reservation.children);
    const breakfastIncluded = row ? row.breakfastStatus === "included" : fromNotes.breakfast_status === "included";
    const beds = unit.unitType === "bunk";
    return [{
      room: beds ? unit.parentRoomNumber ?? unit.roomNumber : unit.roomNumber,
      beds,
      sortOrder: unit.sortOrder,
      guestName: reservation.guestName,
      pax: reservation.adults + reservation.children + reservation.babies,
      breakfastIncluded,
      breakfastPax: breakfastIncluded ? (row ? row.breakfastPax : fromNotes.breakfast_pax) : 0,
      toGo: row?.breakfastToGo ?? false,
      toGoTime: row?.breakfastToGoTime ?? null,
      notes: row?.breakfastNotes?.trim() || null,
      reservationId: reservation.id,
      reference: reservation.reference ?? null,
      arrivalDate: reservation.arrivalDate,
      departureDate: reservation.departureDate
    }];
  });
}

/** Active room numbers with nobody listed, ascending. Room 20 is free only when none of its beds is listed. */
export function freeRooms(units: ControlUnit[], entries: ControlEntry[]) {
  const rooms = new Set(units.filter((unit) => unit.active).map((unit) => unit.unitType === "bunk" ? unit.parentRoomNumber ?? unit.roomNumber : unit.roomNumber));
  for (const entry of entries) rooms.delete(entry.room);
  return [...rooms].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/** One room line, shared by the page card and the text. Room 20 beds are merged into "20 camas". */
export type ControlLine = { room: string; label: string; beds: boolean; sortOrder: number; names: string[]; pax: number; included: boolean; breakfastPax: number; toGo: boolean; toGoTime: string | null; notes: string[];
  /** A booking over several rooms, pax not split yet: "Reserva en 14 + 18: repartir pax" / "Misma reserva que 14". */
  stayNote: string | null };
export type ControlSummary = { lines: ControlLine[]; free: string[]; guests: number; includedPax: number; includedRooms: number };

const guestPax = (entry: ControlEntry): PaxRow => ({ ...entry, dorm: entry.beds });
const coverPax = (entry: ControlEntry): PaxRow => ({ ...entry, dorm: entry.beds, pax: entry.breakfastPax });

export function summarizeBreakfastControl({ entries, free }: { entries: ControlEntry[]; free: string[] }): ControlSummary {
  const lines = new Map<string, ControlLine>();
  const lineEntries = new Map<string, ControlEntry[]>();
  entries.forEach((entry, index) => {
    const key = entry.beds ? `beds:${entry.room}` : `entry:${index}`;
    const line = lines.get(key) ?? { room: entry.room, label: entry.beds ? `${entry.room} camas` : entry.room, beds: entry.beds, sortOrder: entry.sortOrder, names: [], pax: 0, included: false, breakfastPax: 0, toGo: false, toGoTime: null, notes: [], stayNote: null };
    const name = entry.guestName ? displayGuestName(entry.guestName) : "";
    if (name && !line.names.includes(name)) line.names.push(name);
    if (entry.notes && !line.notes.includes(entry.notes)) line.notes.push(entry.notes);
    line.sortOrder = Math.min(line.sortOrder, entry.sortOrder);
    lineEntries.set(key, [...(lineEntries.get(key) ?? []), entry]);
    if (entry.breakfastIncluded) line.included = true;
    if (entry.toGo) {
      line.toGo = true;
      const time = entry.toGoTime?.slice(0, 5) ?? null;
      if (time && (!line.toGoTime || time < line.toGoTime)) line.toGoTime = time;
    }
    lines.set(key, line);
  });
  // Each booking once (shared allocatePax): a booking over several rooms or beds counts on its first one.
  const ordered = entries.map((entry, index) => ({ entry, index })).sort((a, b) => a.entry.sortOrder - b.entry.sortOrder);
  const guests = allocatePax(ordered.map(({ entry }) => guestPax(entry)));
  const includedOrdered = ordered.filter(({ entry }) => entry.breakfastIncluded);
  const covers = allocatePax(includedOrdered.map(({ entry }) => coverPax(entry)));
  const coversByIndex = new Map(includedOrdered.map(({ index }, position) => [index, covers[position].pax]));
  const counted = new Map(ordered.map(({ index }, position) => [index, { pax: guests[position].pax, covers: coversByIndex.get(index) ?? 0, group: guests[position].group, firstRoom: guests[position].group ? ordered[guests[position].group!.firstIndex].entry.room : null }]));
  const rooms = new Map<string, string[]>();
  ordered.forEach(({ entry }, position) => {
    const group = guests[position].group;
    if (!group || group.dorm) return;
    const first = ordered[group.firstIndex].entry.room;
    rooms.set(first, [...new Set([...(rooms.get(first) ?? []), entry.room])]);
  });
  for (const [key, line] of lines) {
    const listed = (lineEntries.get(key) ?? []).map((entry) => counted.get(entries.indexOf(entry))!);
    line.pax = listed.reduce((sum, row) => sum + row.pax, 0);
    line.breakfastPax = listed.reduce((sum, row) => sum + row.covers, 0);
    const shared = listed.find((row) => row.group && !row.group.dorm);
    if (shared?.firstRoom) {
      line.stayNote = shared.group!.first ? `Reserva en ${(rooms.get(shared.firstRoom) ?? []).join(" + ")}: repartir pax` : `Misma reserva que ${shared.firstRoom}`;
    }
  }

  const sorted = [...lines.values()].sort((a, b) => a.sortOrder - b.sortOrder);
  const included = sorted.filter((line) => line.included);
  return {
    lines: sorted,
    free,
    guests: sorted.reduce((sum, line) => sum + line.pax, 0),
    includedPax: sorted.reduce((sum, line) => sum + line.breakfastPax, 0),
    includedRooms: included.length
  };
}

export const freeLabel = (free: string[]) => free.length ? free.join(", ") : "ninguna";

function formatLine(line: ControlLine) {
  const parts = [line.label, line.names.length ? line.names.join(" / ") : "—", `${line.pax} pax`];
  if (line.included) parts.push(`\u2705 DESAYUNO INCLUIDO${line.breakfastPax !== line.pax ? ` (${line.breakfastPax} pax)` : ""}`);
  if (line.toGo) parts.push(`\u{1F961} para llevar${line.toGoTime ? ` ${line.toGoTime}` : ""}`);
  if (line.notes.length) parts.push(`\u{1F4DD} ${line.notes.join(" / ")}`);
  if (line.stayNote) parts.push(line.stayNote);
  return parts.join(" · ");
}

/**
 * Keeps text inside Latin-1 (code points up to 0xFF): Spanish letters stay, other accented letters
 * lose their accent, emoji and other symbols are dropped. WhatsApp Desktop on Windows shows emoji
 * from a wa.me link as replacement characters.
 */
export function latin1Only(text: string) {
  // single-line fields (names, notes): the shared WhatsApp sanitizer, then one line
  return sanitize(text).replace(/\s+/g, " ").trim();
}

function formatWhatsAppLine(line: ControlLine) {
  const names = line.names.map(latin1Only).filter(Boolean);
  let text = [line.label, names.length ? names.join(" / ") : "-", `${line.pax} pax`].join(" · ");
  if (line.included) text += ` · *DESAYUNO INCLUIDO*${line.breakfastPax !== line.pax ? ` (${line.breakfastPax} pax)` : ""}`;
  if (line.toGo) text += ` (para llevar${line.toGoTime ? ` ${line.toGoTime}` : ""})`;
  const notes = line.notes.map(latin1Only).filter(Boolean);
  if (notes.length) text += ` · ALERGIA/NOTA: ${notes.join(" / ")}`;
  if (line.stayNote) text += ` · ${line.stayNote}`;
  return text;
}

/** Emoji-free text for the WhatsApp link only (bold with *asterisks*); Copiar texto keeps the emoji version. */
export function formatBreakfastControlWhatsApp({ date, summary }: { date: string; summary: ControlSummary }) {
  return [
    `*Control de desayunos · ${controlDateLabel(date)}*`,
    "",
    ...(summary.lines.length ? summary.lines.map(formatWhatsAppLine) : ["Sin huéspedes para el desayuno."]),
    `Libres: ${freeLabel(summary.free)}`,
    "",
    `*Total huéspedes en el hotel: ${summary.guests} pax*`,
    `*Con desayuno incluido: ${summary.includedPax} pax (${summary.includedRooms} hab.)*`
  ].join("\n");
}

/** Plain text for Copiar texto (with emoji), built from the same summary as the page card. */
export function formatBreakfastControl({ date, summary }: { date: string; summary: ControlSummary }) {
  return [
    `Control de desayunos · ${controlDateLabel(date)}`,
    "",
    ...(summary.lines.length ? summary.lines.map(formatLine) : ["Sin huéspedes para el desayuno."]),
    `Libres: ${freeLabel(summary.free)}`,
    "",
    `Total huéspedes en el hotel: ${summary.guests} pax`,
    `Con desayuno incluido: ${summary.includedPax} pax (${summary.includedRooms} hab.)`
  ].join("\n");
}
