import type { BoardRow } from "@/features/operations/components/RoomBoardTable";
import type { BoardTour } from "@/features/operations/logic/board-tours";
import { displayGuestName } from "@/features/operations/logic/breakfast-control";
import { groupByStay, totalPax, type PaxRow } from "@/features/operations/logic/pax";

/**
 * The printable Room board ("Tablero de operaciones"): one line per room, all 25 units,
 * Room 20's beds merged into "20 camas" with a dorm booking's pax counted once.
 * Pago/Saldo are only filled in when the sheet is printed with "Incluir pagos".
 */

/** A board row plus what the sheet needs to merge Room 20's beds. */
export type BoardSheetRow = BoardRow & { roomNumber: string; dorm: boolean; reservationId: string | null; arrivalDate: string | null };

export type BoardSheetLine = {
  label: string;
  beds: boolean;
  status: BoardRow["operationalStatus"];
  /** "Vacante tras salida", "Salida y entrada el mismo día"… under the status pill. */
  statusNotes: string[];
  names: string[];
  pax: number;
  breakfastIncluded: boolean;
  breakfastPax: number;
  toGoTime: string | null;
  toGo: boolean;
  plates: string[];
  channels: string[];
  departures: string[];
  tours: BoardTour[];
  notes: string[];
  payments: string[];
  balances: string[];
};

export type BoardSheetSummary = { lines: BoardSheetLine[]; pax: number; occupied: number; units: number; free: number; breakfastPax: number };

export const STATUS_LABEL: Record<BoardRow["operationalStatus"], string> = { check_in: "Llegada", staying: "Permanece", available: "Libre", out_of_service: "Fuera de servicio" };
const HOUSEKEEPING_LABEL: Record<string, string> = { priority: "Prioridad", vacant_after_departure: "Vacante tras salida", remains_occupied: "Sigue ocupada" };
const PAYMENT_LABEL: Record<string, string> = { pending: "Pendiente", paid: "Pagado", partial: "Parcial" };
// A merged line shows the busiest bed: an arrival before a stay, a stay before a free bed.
const STATUS_RANK: Record<BoardRow["operationalStatus"], number> = { check_in: 3, staying: 2, available: 1, out_of_service: 0 };

const unique = (values: (string | null | undefined)[]) => [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
const paxRow = (row: BoardSheetRow, pax: number): PaxRow => ({ dorm: row.dorm, pax, reservationId: row.reservationId, guestName: row.guestName, arrivalDate: row.arrivalDate, departureDate: row.departureDate });

/** "2026-10-25" -> "25/10" */
export const shortDate = (isoDate: string) => `${isoDate.slice(8, 10)}/${isoDate.slice(5, 7)}`;

export const balanceLabel = (row: Pick<BoardRow, "outstandingBalance" | "currency">) =>
  row.outstandingBalance != null ? `${row.currency ? `${row.currency} ` : ""}${row.outstandingBalance.toFixed(2)}` : null;

function sheetLine(label: string, beds: boolean, rows: BoardSheetRow[]): BoardSheetLine {
  const status = rows.reduce((best, row) => STATUS_RANK[row.operationalStatus] > STATUS_RANK[best] ? row.operationalStatus : best, rows[0].operationalStatus);
  const included = rows.filter((row) => row.breakfastStatus === "included");
  const toGo = rows.filter((row) => row.breakfastToGo);
  const toGoTime = toGo.map((row) => row.breakfastToGoTime).filter((time): time is string => Boolean(time)).sort()[0] ?? null;
  // A dorm booking repeats its balance on every bed: one balance per stay.
  const stays = groupByStay(rows.map((row) => ({ ...paxRow(row, 0), row }))).map((group) => group[0].row);
  const tours = new Map(rows.flatMap((row) => row.tours).map((tour) => [tour.id, tour]));
  return {
    label,
    beds,
    status,
    statusNotes: unique(rows.flatMap((row) => [row.housekeepingCategory ? HOUSEKEEPING_LABEL[row.housekeepingCategory] : null, row.sameDayArrival ? "Salida y entrada el mismo día" : null])),
    names: unique(rows.map((row) => row.guestName ? displayGuestName(row.guestName) : null)),
    pax: totalPax(rows.map((row) => paxRow(row, row.totalPax))),
    breakfastIncluded: included.length > 0,
    breakfastPax: totalPax(included.map((row) => paxRow(row, row.breakfastPax))),
    toGo: toGo.length > 0,
    toGoTime,
    plates: unique(rows.map((row) => row.carPlate)),
    channels: unique(rows.map((row) => row.bookingChannel)),
    departures: unique(rows.map((row) => row.departureDate ? shortDate(row.departureDate) : null)),
    tours: [...tours.values()],
    notes: unique(rows.map((row) => row.notes)),
    payments: unique(stays.map((row) => row.paymentStatus ? `${PAYMENT_LABEL[row.paymentStatus] ?? row.paymentStatus}${row.paymentMethod ? ` · ${row.paymentMethod}` : ""}` : null)),
    balances: unique(stays.map(balanceLabel))
  };
}

/** Lines in board order; Room 20's beds become one "20 camas" line where the first bed sits. */
export function summarizeBoardSheet(rows: BoardSheetRow[]): BoardSheetSummary {
  const groups = new Map<string, { label: string; beds: boolean; rows: BoardSheetRow[] }>();
  for (const row of rows) {
    const key = row.dorm ? `beds:${row.roomNumber}` : `room:${row.roomId}`;
    const group = groups.get(key) ?? { label: row.dorm ? `${row.roomNumber} camas` : row.roomNumber, beds: row.dorm, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }
  const lines = [...groups.values()].map((group) => sheetLine(group.label, group.beds, group.rows));
  const isOccupied = (line: BoardSheetLine) => line.status === "check_in" || line.status === "staying";
  return {
    lines,
    pax: totalPax(rows.map((row) => paxRow(row, row.totalPax))),
    occupied: lines.filter(isOccupied).length,
    units: rows.length,
    free: lines.filter((line) => line.status === "available").length,
    breakfastPax: totalPax(rows.filter((row) => row.breakfastStatus === "included").map((row) => paxRow(row, row.breakfastPax)))
  };
}
