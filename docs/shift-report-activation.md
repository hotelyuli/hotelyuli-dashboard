# Shift reports

Report storage lives in `shift_reports` (migration 0015). No AI or external API is used.

## How the report is produced

`/reports` → **Generar reporte / Actualizar reporte** builds the English report
(spec §13) from saved records only, via `features/shift-reports/template.ts`:

- Title `Morning|Afternoon|Night Shift Report – {date}`, then `Receptionist: {name}`.
- **Arrivals & Departures** — the day's scheduled check-ins (board) and
  check-outs (reservations), arrival/departure incidents, and whether tomorrow's
  arrivals were contacted.
- **Guest Service** — guest request/complaint incidents, takeaway breakfasts and
  the breakfast-report confirmation.
- **Maintenance** — maintenance incidents.
- **Security & Other** — only when such incidents exist.
- **Tours / Payments / Administration** — tours recorded that day (hotel
  commission only) and income entries, reversals included; settled USD and CRC
  totals shown separately.
- **Open Follow-ups** — open/in-progress tasks, carried-over ones labelled.
- **Receptionist Notes** — the receptionist's free text, copied verbatim
  (Spanish or English).
- Ends `Pura Vida, {receptionist}`.

Each incident line carries time, room/area, description, action taken, status,
and its linked task's status/assignee. All of the day's incidents are included
by default; the receptionist can untick those from another shift. Checklist
confirmations are reported as "confirmed" / "NOT confirmed" — never assumed.

The generated text stays editable. If the underlying records or the notes change
after generating, saving is blocked until the report is regenerated.

## Buttons

Generate/Update report · Save final report (saves, still editable) · Copy ·
WhatsApp · Print / PDF · Confirm closing (checklist required; the closed report is
read-only, enforced by the database).
