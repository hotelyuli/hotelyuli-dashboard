import { breakfastFromNotes } from "@/features/operations/logic/breakfast";

/**
 * "Control de desayunos": the list for breakfast on date D, sent the day before.
 * A reservation eats on D when it arrived before D and has not left before D
 * (arrival < D <= departure): today's arrivals, stay-throughs and D's departures.
 * The text never carries amounts or currencies.
 */

export type ControlUnit = { roomId: string; roomNumber: string; unitType: "room" | "bunk"; parentRoomNumber: string | null; sortOrder: number; active: boolean };
export type ControlReservation = { id: string; roomId: string; guestName: string | null; arrivalDate: string; departureDate: string; adults: number; children: number; babies: number; notes: string | null };
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
};

const WEEKDAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

export function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
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
      notes: row?.breakfastNotes?.trim() || null
    }];
  });
}

/** Active rooms with nobody listed; Room 20's beds count as one room. */
export function freeRooms(units: ControlUnit[], entries: ControlEntry[]) {
  const rooms = new Set(units.filter((unit) => unit.active).map((unit) => unit.unitType === "bunk" ? unit.parentRoomNumber ?? unit.roomNumber : unit.roomNumber));
  for (const entry of entries) rooms.delete(entry.room);
  return rooms.size;
}

type Line = { room: string; beds: boolean; sortOrder: number; names: string[]; pax: number; included: boolean; breakfastPax: number; toGoTimes: string[]; toGo: boolean; notes: string[] };

function formatLine(line: Line) {
  const parts = [line.beds ? `${line.room} (camas)` : line.room, line.names.length ? line.names.join(" / ") : "—", `${line.pax} pax`];
  if (line.included) parts.push(`✅ DESAYUNO INCLUIDO${line.breakfastPax !== line.pax ? ` (${line.breakfastPax} pax)` : ""}`);
  if (line.toGo) parts.push(`🥡 para llevar${line.toGoTimes.length ? ` ${[...line.toGoTimes].sort()[0]}` : ""}`);
  if (line.notes.length) parts.push(`📝 ${line.notes.join(" / ")}`);
  return parts.join(" · ");
}

/** Plain text for Copiar / WhatsApp / Imprimir. Room 20 beds merge into one "20 (camas)" line. */
export function formatBreakfastControl({ date, entries, free }: { date: string; entries: ControlEntry[]; free: number }) {
  const lines = new Map<string, Line>();
  entries.forEach((entry, index) => {
    const key = entry.beds ? `beds:${entry.room}` : `entry:${index}`;
    const line = lines.get(key) ?? { room: entry.room, beds: entry.beds, sortOrder: entry.sortOrder, names: [], pax: 0, included: false, breakfastPax: 0, toGoTimes: [], toGo: false, notes: [] };
    const name = entry.guestName?.trim();
    if (name && !line.names.includes(name)) line.names.push(name);
    if (entry.notes && !line.notes.includes(entry.notes)) line.notes.push(entry.notes);
    line.sortOrder = Math.min(line.sortOrder, entry.sortOrder);
    line.pax += entry.pax;
    if (entry.breakfastIncluded) {
      line.included = true;
      line.breakfastPax += entry.breakfastPax;
    }
    if (entry.toGo) {
      line.toGo = true;
      if (entry.toGoTime) line.toGoTimes.push(entry.toGoTime.slice(0, 5));
    }
    lines.set(key, line);
  });

  const sorted = [...lines.values()].sort((a, b) => a.sortOrder - b.sortOrder);
  const guests = sorted.reduce((sum, line) => sum + line.pax, 0);
  const included = sorted.filter((line) => line.included);
  const includedPax = included.reduce((sum, line) => sum + line.breakfastPax, 0);

  return [
    `Control de desayunos · ${controlDateLabel(date)}`,
    "",
    ...(sorted.length ? sorted.map(formatLine) : ["Sin huéspedes para el desayuno."]),
    `Libres: ${free}`,
    "",
    `Total huéspedes en el hotel: ${guests} pax`,
    `Con desayuno incluido: ${includedPax} pax (${included.length} hab.)`
  ].join("\n");
}
