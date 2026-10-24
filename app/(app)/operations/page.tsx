import { cookies } from "next/headers";
import { formatInTimeZone } from "date-fns-tz";
import { dictionary, type Locale } from "@/lib/i18n";
import { requireSession } from "@/features/auth/logic/guards";
import { RoomBoardTable, type RoomOption } from "@/features/operations/components/RoomBoardTable";
import { RoomBoardPrintActions, RoomBoardPrintProvider, RoomBoardPrintSheet } from "@/features/operations/components/RoomBoardPrint";
import { summarizeBoardSheet } from "@/features/operations/logic/board-sheet";
import { BOARD_OPERATION_COLUMNS, buildBoardRows } from "@/features/operations/logic/board-rows";
import { reservationReferences } from "@/features/operations/services/reservation-references";
import { boardToursFilter, toursByUnit } from "@/features/operations/logic/board-tours";

export const metadata = { title: "Operations" };

export default async function OperationsPage() {
  const locale = ((await cookies()).get("yulios-locale")?.value ?? "es") as Locale;
  const t = dictionary(locale);
  const { supabase, user } = await requireSession();
  const { data: profile } = await supabase.from("profiles").select("hotel_id").eq("id", user.id).single();
  const hotelId = profile?.hotel_id ?? "";
  const operationDate = formatInTimeZone(new Date(), "America/Costa_Rica", "yyyy-MM-dd");

  const [{ data: rooms }, { data: operations }, { data: tourBookings }] = await Promise.all([
    supabase
      .from("rooms")
      .select("id, display_name, room_number, sort_order, active, unit_code, unit_type")
      .eq("hotel_id", hotelId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("daily_operations")
      .select(BOARD_OPERATION_COLUMNS)
      .eq("hotel_id", hotelId)
      .eq("operation_date", operationDate),
    supabase.from("tour_bookings").select("id, room_number, guest_name, tour_name, tour_date, operation_date, status").eq("hotel_id", hotelId).neq("status", "cancelled").or(boardToursFilter(operationDate))
  ]);

  const opsByRoom = new Map((operations ?? []).map((row) => [row.room_id, row]));
  const roomOptions: RoomOption[] = (rooms ?? []).map((room) => ({ id: room.id, displayName: room.display_name }));

  const toursForUnit = toursByUnit(tourBookings ?? [], operationDate, new Map((rooms ?? []).map((room) => [room.unit_code, opsByRoom.get(room.id)?.guest_name ?? null])));
  const references = await reservationReferences(supabase, hotelId, (operations ?? []).map((row) => row.reservation_id));
  const rows = buildBoardRows({ rooms: rooms ?? [], operations: operations ?? [], references, toursForUnit });

  return (
    <main className="dashboard-page room-board-page">
      <RoomBoardPrintProvider>
        <div className="page-heading">
          <div>
            <p className="eyebrow">{t.operations.toUpperCase()}</p>
            <h1>{t.operationsTitle}</h1>
            <p>{t.operationsSubtitle}</p>
          </div>
          <RoomBoardPrintActions date={operationDate} locale={locale} />
        </div>
        <RoomBoardTable rows={rows} rooms={roomOptions} locale={locale} />
        <h2 className="room-board-preview-title">{locale === "es" ? "Vista previa para imprimir" : "Print preview"}</h2>
        <RoomBoardPrintSheet date={operationDate} generatedAt={new Date()} summary={summarizeBoardSheet(rows)} />
      </RoomBoardPrintProvider>
    </main>
  );
}
