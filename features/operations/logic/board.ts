export type OperationalStatus = "check_in" | "staying" | "available" | "out_of_service";
export type HousekeepingCategory = "priority" | "vacant_after_departure" | "remains_occupied" | null;
export type PaymentStatus = "pending" | "paid" | null;

export type ReservationForBoard = {
  id: string;
  roomId: string;
  guestName: string | null;
  arrivalDate: string;
  departureDate: string;
  adults: number;
  children: number;
  babies: number;
  outstandingBalance: number | null;
  currency: "USD" | "CRC" | null;
};

export type UnitForBoard = {
  roomId: string;
  outOfService?: boolean;
};

export type MaterializedCell = {
  roomId: string;
  operationalStatus: OperationalStatus;
  housekeepingCategory: HousekeepingCategory;
  sameDayArrival: boolean;
  reservationId: string | null;
  guestName: string | null;
  adults: number;
  children: number;
  babies: number;
  arrivalDate: string | null;
  departureDate: string | null;
  outstandingBalance: number | null;
  currency: "USD" | "CRC" | null;
  /** Outstanding balance > 0 -> pending, == 0 -> paid, no occupant/no data -> null. */
  paymentStatus: PaymentStatus;
};

const EMPTY_OCCUPANT = {
  reservationId: null,
  guestName: null,
  adults: 0,
  children: 0,
  babies: 0,
  arrivalDate: null,
  departureDate: null,
  outstandingBalance: null,
  currency: null,
  paymentStatus: null
} as const;

function occupantFields(reservation: ReservationForBoard) {
  const paymentStatus: PaymentStatus = reservation.outstandingBalance == null ? null : reservation.outstandingBalance > 0 ? "pending" : "paid";
  return {
    reservationId: reservation.id,
    guestName: reservation.guestName,
    adults: reservation.adults,
    children: reservation.children,
    babies: reservation.babies,
    arrivalDate: reservation.arrivalDate,
    departureDate: reservation.departureDate,
    outstandingBalance: reservation.outstandingBalance,
    currency: reservation.currency,
    paymentStatus
  };
}

export function materializeUnit(
  unitReservations: ReservationForBoard[],
  date: string,
  outOfService = false
): MaterializedCell {
  const roomId = unitReservations[0]?.roomId ?? "";

  if (outOfService) {
    return { roomId, operationalStatus: "out_of_service", housekeepingCategory: null, sameDayArrival: false, ...EMPTY_OCCUPANT };
  }

  const arriving = unitReservations.find((r) => r.arrivalDate === date);
  const departing = unitReservations.find((r) => r.departureDate === date);

  if (arriving) {
    const sameDayArrival = Boolean(departing && departing.id !== arriving.id);
    return {
      roomId,
      operationalStatus: "check_in",
      housekeepingCategory: sameDayArrival ? "priority" : null,
      sameDayArrival,
      ...occupantFields(arriving)
    };
  }

  const staying = unitReservations.find((r) => r.arrivalDate < date && r.departureDate > date);
  if (staying) {
    return {
      roomId,
      operationalStatus: "staying",
      housekeepingCategory: "remains_occupied",
      sameDayArrival: false,
      ...occupantFields(staying)
    };
  }

  if (departing) {
    return { roomId, operationalStatus: "available", housekeepingCategory: "vacant_after_departure", sameDayArrival: false, ...EMPTY_OCCUPANT };
  }

  return { roomId, operationalStatus: "available", housekeepingCategory: null, sameDayArrival: false, ...EMPTY_OCCUPANT };
}

export function materializeBoard(units: UnitForBoard[], reservations: ReservationForBoard[], date: string): MaterializedCell[] {
  const byRoom = new Map<string, ReservationForBoard[]>();
  for (const reservation of reservations) {
    const list = byRoom.get(reservation.roomId) ?? [];
    list.push(reservation);
    byRoom.set(reservation.roomId, list);
  }

  return units.map((unit) => {
    const cell = materializeUnit(byRoom.get(unit.roomId) ?? [], date, unit.outOfService);
    return { ...cell, roomId: unit.roomId };
  });
}
