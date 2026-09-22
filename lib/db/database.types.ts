// Placeholder generated-shape types for Module 1.
// Replace with: supabase gen types typescript --linked > lib/db/database.types.ts
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      supplier_contacts: {
        Row: {id:string;hotel_id:string;name:string;category:string;phone:string;notes:string;operator_name:string;created_by:string|null;created_at:string;updated_at:string};
        Insert: {id?:string;hotel_id:string;name:string;category:string;phone:string;notes?:string;operator_name?:string;created_by?:string;created_at?:string;updated_at?:string};
        Update: {name?:string;category?:string;phone?:string;notes?:string;operator_name?:string;updated_at?:string};
        Relationships: [];
      };
      report_snapshots: {
        Row: { id:string; hotel_id:string; operation_date:string; report_kind:"breakfast"|"housekeeping"; locale:"en"|"es"; report_text:string; content_hash:string; created_by:string; created_at:string };
        Insert: { id?:string; hotel_id:string; operation_date:string; report_kind:"breakfast"|"housekeeping"; locale:"en"|"es"; report_text:string; content_hash:string; created_by:string; created_at?:string };
        Update: never;
        Relationships: [];
      };
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
          payment_status: string | null; payment_method: string | null; outstanding_balance: number | null; currency: "USD" | "CRC" | null;
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
          payment_status?: string | null; payment_method?: string | null; outstanding_balance?: number | null; currency?: "USD" | "CRC" | null;
          car_plate?: string | null; booking_channel?: string | null; notes?: string | null;
          housekeeping_category?: "priority" | "vacant_after_departure" | "remains_occupied" | null;
          same_day_arrival?: boolean; manually_modified?: boolean; created_at?: string; updated_at?: string;
        };
        Update: {
          reservation_id?: string | null; guest_name?: string | null; adults?: number; children?: number; babies?: number; total_pax?: number;
          arrival_date?: string | null; departure_date?: string | null;
          operational_status?: "check_in" | "staying" | "available" | "out_of_service";
          breakfast_status?: "included" | "not_included"; breakfast_pax?: number; breakfast_to_go?: boolean; breakfast_notes?: string | null;
          payment_status?: string | null; payment_method?: string | null; outstanding_balance?: number | null; currency?: "USD" | "CRC" | null;
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
      shift_events: {
        Row: { id: string; hotel_id: string; operation_date: string; event_time: string; category: string; room_area: string | null; description: string; action_taken: string | null; status: string; priority: string; requires_follow_up: boolean; created_by: string; created_at: string; updated_at: string };
        Insert: { id?: string; hotel_id: string; operation_date: string; event_time: string; category: string; room_area?: string | null; description: string; action_taken?: string | null; status: string; priority: string; requires_follow_up?: boolean; created_by: string; created_at?: string; updated_at?: string };
        Update: { event_time?: string; category?: string; room_area?: string | null; description?: string; action_taken?: string | null; status?: string; priority?: string; requires_follow_up?: boolean; updated_at?: string };
        Relationships: [];
      };
      tasks: {
        Row: { id: string; hotel_id: string; operation_date: string; source_event_id: string | null; title: string; room_area: string | null; priority: string; status: string; assigned_to: string | null; due_at: string | null; created_by: string; created_at: string; updated_at: string };
        Insert: { id?: string; hotel_id: string; operation_date: string; source_event_id?: string | null; title: string; room_area?: string | null; priority: string; status?: string; assigned_to?: string | null; due_at?: string | null; created_by: string; created_at?: string; updated_at?: string };
        Update: { title?: string; room_area?: string | null; priority?: string; status?: string; assigned_to?: string | null; due_at?: string | null; updated_at?: string };
        Relationships: [];
      };
      tour_bookings: {
        Row: { id: string; hotel_id: string; operation_date: string; guest_name: string; room_number: string | null; operator_name: string; tour_name: string; tour_date: string; adults: number; children: number; total_price: number; currency: "USD" | "CRC"; commission_amount: number; status: string; payment_method: string | null; receipt_number: string | null; booked_by: string; notes: string | null; created_by: string; created_at: string; updated_at: string };
        Insert: { id?: string; hotel_id: string; operation_date: string; guest_name: string; room_number?: string | null; operator_name: string; tour_name: string; tour_date: string; adults?: number; children?: number; total_price: number; currency: "USD" | "CRC"; commission_amount?: number; status: string; payment_method?: string | null; receipt_number?: string | null; booked_by: string; notes?: string | null; created_by: string; created_at?: string; updated_at?: string };
        Update: { guest_name?: string; room_number?: string | null; operator_name?: string; tour_name?: string; tour_date?: string; adults?: number; children?: number; total_price?: number; currency?: "USD" | "CRC"; commission_amount?: number; status?: string; payment_method?: string | null; receipt_number?: string | null; booked_by?: string; notes?: string | null; updated_at?: string };
        Relationships: [];
      };
      income_entries: {
        Row: { id: string; hotel_id: string; operation_date: string; room_number: string | null; guest_name: string; paid: boolean; category: string; amount: number; currency: "USD" | "CRC"; payment_method: string; reference_note: string | null; created_by: string; created_at: string; updated_at: string };
        Insert: { id?: string; hotel_id: string; operation_date: string; room_number?: string | null; guest_name: string; paid?: boolean; category: string; amount: number; currency: "USD" | "CRC"; payment_method: string; reference_note?: string | null; created_by: string; created_at?: string; updated_at?: string };
        Update: { room_number?: string | null; guest_name?: string; paid?: boolean; category?: string; amount?: number; currency?: "USD" | "CRC"; payment_method?: string; reference_note?: string | null; updated_at?: string };
        Relationships: [];
      };
      shift_reports: {
        Row: { id: string; hotel_id: string; operation_date: string; shift: "morning" | "afternoon" | "night"; receptionist: string; final_report_en: string; inputs: Json; source_snapshot: Json; status: "draft" | "closed"; revision: number; created_by: string; updated_by: string; closed_at: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; hotel_id: string; operation_date: string; shift: "morning" | "afternoon" | "night"; receptionist: string; final_report_en: string; inputs: Json; source_snapshot: Json; status: "draft" | "closed"; revision: number; created_by: string; updated_by: string; closed_at?: string | null; updated_at?: string };
        Update: { hotel_id?: string; operation_date?: string; shift?: "morning" | "afternoon" | "night"; receptionist?: string; final_report_en?: string; inputs?: Json; source_snapshot?: Json; status?: "draft" | "closed"; revision?: number; updated_by?: string; closed_at?: string | null; updated_at?: string };
        Relationships: [];
      };
      google_sheets_outbox: {
        Row: { id: string; hotel_id: string; entity_type: "tour" | "income"; entity_id: string; payload: Json; status: "pending" | "sent" | "failed"; attempt_count: number; last_error: string | null; sent_at: string | null; created_at: string };
        Insert: { id?: string; hotel_id: string; entity_type: "tour" | "income"; entity_id: string; payload: Json; status?: "pending" | "sent" | "failed"; attempt_count?: number; last_error?: string | null; sent_at?: string | null; created_at?: string };
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
