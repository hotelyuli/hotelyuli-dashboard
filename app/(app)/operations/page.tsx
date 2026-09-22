import { cookies } from "next/headers";
import { formatInTimeZone } from "date-fns-tz";
import { dictionary, type Locale } from "@/lib/i18n";
import { requireSession } from "@/features/auth/logic/guards";
import { RoomBoardTable, type BoardRow, type RoomOption } from "@/features/operations/components/RoomBoardTable";

export const metadata = { title: "Operations" };

export default async function OperationsPage() {
  const locale = ((await cookies()).get("yulios-locale")?.value ?? "es") as Locale;
  const t = dictionary(locale);
  const { supabase, user } = await requireSession();
  const { data: profile } = await supabase.from("profiles").select("hotel_id").eq("id", user.id).single();
  const hotelId = profile?.hotel_id ?? "";
  const operationDate = formatInTimeZone(new Date(), "America/Costa_Rica", "yyyy-MM-dd");

  const [{ data: rooms }, { data: operations }] = await Promise.all([
    supabase
      .from("rooms")
      .select("id, display_name, room_number, sort_order, active, unit_code")
      .eq("hotel_id", hotelId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("daily_operations")
      .select(
        "id, room_id, guest_name, adults, children, babies, total_pax, departure_date, operational_status, breakfast_status, breakfast_pax, breakfast_to_go, breakfast_notes, payment_status, payment_method, outstanding_balance, currency, car_plate, booking_channel, notes, housekeeping_category, same_day_arrival, housekeeper, bed_setup, breakfast_to_go_time"
      )
      .eq("hotel_id", hotelId)
      .eq("operation_date", operationDate)
  ]);

  const opsByRoom = new Map((operations ?? []).map((row) => [row.room_id, row]));
  const roomOptions: RoomOption[] = (rooms ?? []).map((room) => ({ id: room.id, displayName: room.display_name }));

  const rows: BoardRow[] = (rooms ?? []).map((room) => {
    const op = opsByRoom.get(room.id);
    return {
      rowId: op?.id ?? null,
      roomId: room.id,
      roomLabel: room.display_name,
      guestName: op?.guest_name ?? null,
      adults: op?.adults ?? 0,
      children: op?.children ?? 0,
      babies: op?.babies ?? 0,
      totalPax: op?.total_pax ?? 0,
      departureDate: op?.departure_date ?? null,
      operationalStatus: op?.operational_status ?? (room.active ? "available" : "out_of_service"),
      breakfastStatus: op?.breakfast_status ?? "not_included",
      breakfastPax: op?.breakfast_pax ?? 0,
      breakfastToGo: op?.breakfast_to_go ?? false,
      breakfastNotes: op?.breakfast_notes ?? null,
      paymentStatus: op?.payment_status ?? null,
      paymentMethod: op?.payment_method ?? null,
      outstandingBalance: op?.outstanding_balance ?? null,
      currency: op?.currency ?? null,
      carPlate: op?.car_plate ?? null,
      bookingChannel: op?.booking_channel ?? null,
      notes: op?.notes ?? null,
      housekeepingCategory: op?.housekeeping_category ?? null,
      sameDayArrival: op?.same_day_arrival ?? false,
      unitCode: room.unit_code,
      housekeeper: op?.housekeeper ?? null,
      bedSetup: op?.bed_setup ?? null,
      breakfastToGoTime: op?.breakfast_to_go_time?.slice(0, 5) ?? null
    };
  });

  return (
    <main className="dashboard-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t.operations.toUpperCase()}</p>
          <h1>{t.operationsTitle}</h1>
          <p>{t.operationsSubtitle}</p>
        </div>
      </div>
      <RoomBoardTable rows={rows} rooms={roomOptions} locale={locale} />
    </main>
  );
}
