// Placeholder generated-shape types for Module 1.
// Replace with: supabase gen types typescript --linked > lib/db/database.types.ts
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      hotels: {
        Row: { id: string; name: string; slug: string; timezone: string; active: boolean; created_at: string };
        Insert: { id?: string; name: string; slug: string; timezone?: string; active?: boolean; created_at?: string };
        Update: { name?: string; slug?: string; timezone?: string; active?: boolean };
        Relationships: [];
      };
      profiles: {
        Row: { id: string; hotel_id: string; full_name: string; role: Database["public"]["Enums"]["app_role"]; active: boolean; created_at: string; updated_at: string };
        Insert: { id: string; hotel_id: string; full_name: string; role: Database["public"]["Enums"]["app_role"]; active?: boolean; created_at?: string; updated_at?: string };
        Update: { hotel_id?: string; full_name?: string; role?: Database["public"]["Enums"]["app_role"]; active?: boolean; updated_at?: string };
        Relationships: [];
      };
      daily_staff_assignments: {
        Row: { hotel_id: string; operation_date: string; morning_receptionist: string; afternoon_receptionist: string; security_guard: string; updated_by: string; updated_at: string };
        Insert: { hotel_id: string; operation_date: string; morning_receptionist: string; afternoon_receptionist: string; security_guard: string; updated_by: string; updated_at?: string };
        Update: { morning_receptionist?: string; afternoon_receptionist?: string; security_guard?: string; updated_by?: string; updated_at?: string };
        Relationships: [];
      };
      reservation_imports: {
        Row: { id: string; hotel_id: string; operation_date: string; file_type: "check_in" | "check_out"; file_name: string; content_hash: string; row_count: number; headers: string[]; rows: Json; imported_by: string; created_at: string };
        Insert: { id?: string; hotel_id: string; operation_date: string; file_type: "check_in" | "check_out"; file_name: string; content_hash: string; row_count: number; headers: string[]; rows: Json; imported_by: string; created_at?: string };
        Update: never;
        Relationships: [];
      };
      rooms: {
        Row: { id: string; hotel_id: string; unit_code: string; display_name: string; room_number: string; unit_type: "room" | "bunk"; parent_room_number: string | null; sort_order: number; active: boolean; created_at: string };
        Insert: { id?: string; hotel_id: string; unit_code: string; display_name: string; room_number: string; unit_type: "room" | "bunk"; parent_room_number?: string | null; sort_order: number; active?: boolean; created_at?: string };
        Update: { display_name?: string; room_number?: string; active?: boolean; sort_order?: number };
        Relationships: [];
      };
      reservations: {
        Row: { id: string; hotel_id: string; reference: string | null; guest_name: string | null; room_id: string; arrival_date: string; departure_date: string; adults: number; children: number; babies: number; total_amount: number | null; outstanding_balance: number | null; currency: "USD" | "CRC" | null; booking_channel: string | null; notes: string | null; source_import_id: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; hotel_id: string; reference?: string | null; guest_name?: string | null; room_id: string; arrival_date: string; departure_date: string; adults?: number; children?: number; babies?: number; total_amount?: number | null; outstanding_balance?: number | null; currency?: "USD" | "CRC" | null; booking_channel?: string | null; notes?: string | null; source_import_id?: string | null; created_at?: string; updated_at?: string };
        Update: { reference?: string | null; guest_name?: string | null; room_id?: string; arrival_date?: string; departure_date?: string; adults?: number; children?: number; babies?: number; total_amount?: number | null; outstanding_balance?: number | null; currency?: "USD" | "CRC" | null; booking_channel?: string | null; notes?: string | null; updated_at?: string };
        Relationships: [];
      };
      daily_operations: {
        Row: {
          id: string; hotel_id: string; operation_date: string; room_id: string; reservation_id: string | null;
          guest_name: string | null; adults: number; children: number; babies: number; total_pax: number;
          arrival_date: string | null; departure_date: string | null;
          operational_status: "check_in" | "staying" | "available" | "out_of_service";
          breakfast_status: "included" | "not_included"; breakfast_pax: number; breakfast_to_go: boolean; breakfast_notes: string | null;
          payment_status: string | null; outstanding_balance: number | null; currency: "USD" | "CRC" | null;
          car_plate: string | null; booking_channel: string | null; notes: string | null;
          housekeeping_category: "priority" | "vacant_after_departure" | "remains_occupied" | null;
          same_day_arrival: boolean; manually_modified: boolean; created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; hotel_id: string; operation_date: string; room_id: string; reservation_id?: string | null;
          guest_name?: string | null; adults?: number; children?: number; babies?: number; total_pax?: number;
          arrival_date?: string | null; departure_date?: string | null;
          operational_status: "check_in" | "staying" | "available" | "out_of_service";
          breakfast_status?: "included" | "not_included"; breakfast_pax?: number; breakfast_to_go?: boolean; breakfast_notes?: string | null;
          payment_status?: string | null; outstanding_balance?: number | null; currency?: "USD" | "CRC" | null;
          car_plate?: string | null; booking_channel?: string | null; notes?: string | null;
          housekeeping_category?: "priority" | "vacant_after_departure" | "remains_occupied" | null;
          same_day_arrival?: boolean; manually_modified?: boolean; created_at?: string; updated_at?: string;
        };
        Update: {
          reservation_id?: string | null; guest_name?: string | null; adults?: number; children?: number; babies?: number; total_pax?: number;
          arrival_date?: string | null; departure_date?: string | null;
          operational_status?: "check_in" | "staying" | "available" | "out_of_service";
          breakfast_status?: "included" | "not_included"; breakfast_pax?: number; breakfast_to_go?: boolean; breakfast_notes?: string | null;
          payment_status?: string | null; outstanding_balance?: number | null; currency?: "USD" | "CRC" | null;
          car_plate?: string | null; booking_channel?: string | null; notes?: string | null;
          housekeeping_category?: "priority" | "vacant_after_departure" | "remains_occupied" | null;
          same_day_arrival?: boolean; manually_modified?: boolean; updated_at?: string;
        };
        Relationships: [];
      };
      audit_log: {
        Row: { id: string; hotel_id: string; table_name: string; record_id: string; action: "insert" | "update" | "delete"; actor_id: string | null; diff: Json; created_at: string };
        Insert: { id?: string; hotel_id: string; table_name: string; record_id: string; action: "insert" | "update" | "delete"; actor_id?: string | null; diff: Json; created_at?: string };
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      current_hotel_id: { Args: Record<PropertyKey, never>; Returns: string };
      current_app_role: { Args: Record<PropertyKey, never>; Returns: Database["public"]["Enums"]["app_role"] };
    };
    Enums: {
      app_role: "owner" | "manager" | "reception" | "housekeeping" | "restaurant" | "maintenance" | "read_only";
    };
    CompositeTypes: Record<string, never>;
  };
};
