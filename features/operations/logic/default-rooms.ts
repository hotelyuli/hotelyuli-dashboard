export type DefaultRoom = {
  hotel_id: string;
  unit_code: string;
  display_name: string;
  room_number: string;
  unit_type: "room" | "bunk";
  parent_room_number: string | null;
  sort_order: number;
};

export function buildDefaultRooms(hotelId: string): DefaultRoom[] {
  const rooms: DefaultRoom[] = Array.from({ length: 19 }, (_, index) => {
    const roomNumber = String(index + 1);
    return {
      hotel_id: hotelId,
      unit_code: roomNumber,
      display_name: `Room ${roomNumber}`,
      room_number: roomNumber,
      unit_type: "room",
      parent_room_number: null,
      sort_order: index + 1
    };
  });

  const bunks: DefaultRoom[] = Array.from({ length: 6 }, (_, index) => {
    const bunkNumber = index + 1;
    return {
      hotel_id: hotelId,
      unit_code: `B${bunkNumber}`,
      display_name: `Bed ${bunkNumber}`,
      room_number: "20",
      unit_type: "bunk",
      parent_room_number: "20",
      sort_order: 100 + bunkNumber
    };
  });

  return [...rooms, ...bunks];
}
