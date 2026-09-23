# Shift reports

Report storage lives in `shift_reports` (migration 0015).

## Hybrid generation (Claude + facts)

**Generar / Actualizar reporte** collects the shift facts from saved records (incidents, tours,
income, check-ins/outs, breakfast confirmations and whether a breakfast report was saved) plus the
receptionist notes (Spanish or English). If `ANTHROPIC_API_KEY` is set (server-only, Vercel env),
Claude (`claude-opus-5` by default, override with `ANTHROPIC_MODEL`, low effort) weaves them into
one warm English narrative (`features/shift-reports/ai.ts`). The instructions forbid adding any
guest, feedback or fact not in the input; notes are treated as data. The app fixes the title and
the "Pura Vida, {name}" sign-off itself. Without a key, or if the call fails, the structured
report below is generated instead and the screen says why. Guest names and notes are sent to
the Anthropic API when AI is enabled.

## Structured report (fallback)

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
