# CSV import — locked contract (Little Hotelier check-in / check-out reports)

Confirmed against real anonymised sample exports on 2026-09-20 (the samples
themselves are gitignored — see `.gitignore` — and never committed). This
supersedes the Module 2 assumptions; the parser now matches the real files.

## Real column headers

Both reports share this shape (check-in adds `ETA`; check-out doesn't):

`Reservation Number, Invoice Number, Guest Name, Check In|Check Out, LoS, Room Number, Adults / Children / Infants, Extra Person, Outstanding Balance, Total Amount, [ETA], Notes`

`features/operations/logic/reservation-normalizer.ts` matches headers case-
and accent-insensitively, one exact alias per field:

| Field | Real header | Notes |
|---|---|---|
| reference | `Reservation Number` | stored as-is in `reservations.reference` |
| guestName | `Guest Name` | |
| room | `Room Number` | resolved via `room-resolver.ts` |
| arrival (check-in file) | `Check In` | |
| departure (check-out file) | `Check Out` | |
| los | `LoS` | integer nights, required in both files |
| pax | `Adults / Children / Infants` | combined column, split on `/` |
| total | `Total Amount` | |
| balance | `Outstanding Balance` | |
| notes | `Notes` | |

`Invoice Number` and `Extra Person` are not modeled (ignored, harmless).
**`ETA` is deliberately not mapped to anything** — there is no equivalent
field in the schema (estimated arrival *time*, not date); it is left as an
ignored extra column rather than inventing a destination for it.

## Date format

`features/operations/logic/parse-date.ts` accepts:

- `DD-MM-YYYY` (dashes) — the locked primary format, confirmed from the real
  exports (e.g. `19-09-2026`)
- ISO `YYYY-MM-DD` — kept as a tolerant fallback, since it's unambiguous

The previously-assumed `DD/MM/YYYY` (slashes) is **no longer accepted** — it
was never the real format. Anything else is rejected as `INVALID_DATE`
rather than guessed at.

## Neither file has both arrival and departure — LoS bridges the gap

- The check-in file has `Check In` + `LoS`, no departure column.
  `departure = Check In + LoS` nights.
- The check-out file has `Check Out` + `LoS`, no arrival column.
  `arrival = Check Out - LoS` nights.

`LoS` must be a positive integer in both files; otherwise the row is
rejected as `INVALID_LOS`. Both file types now upsert a full reservation row
(same upsert-by-`(hotel_id, reference, arrival_date, room_id)` path), so a
reservation is created/confirmed whichever file it's first seen in.

**Known limitation**: if the real `LoS` value reported in the check-out file
ever differs from the one reported at check-in, the computed arrival dates
won't match and the unique-constraint upsert will insert a second row
instead of reconciling with the first. Not observed in the sample data, but
not guarded against either.

## Pax

`Adults / Children / Infants` (e.g. `"2 / 0 / 0"`) is split on `/` into
three integers. A missing or malformed value defaults all three to `0`
rather than rejecting the row — pax isn't required for the room to resolve
correctly on the board.

## Currency — locked assumption, not inferred

There is no currency column in either file; balances are `$`-prefixed with
no currency code. **Locked assumption**: Little Hotelier reports in the
hotel's base currency, which is USD. Every imported reservation's `currency`
is hardcoded to `USD` — never inferred per-row. CRC only ever enters the
system later, via manual income entry (a later module), never through this
importer.

## Booking channel — inferred from the reference prefix

`Reservation Number` carries a per-channel prefix. `inferBookingChannel()` in
`reservation-normalizer.ts` reads the full run of leading letters
(case-insensitive) and maps it:

| Prefix | booking_channel |
|---|---|
| `LH` | Directo |
| `BDC` | Booking.com |
| `EXP` | Expedia |
| `SMP` | Simple Booking |
| `HWL` | Hostelworld |

Any other prefix, or no reference, stores `null`. `reference` is still stored
as-is. The channel is copied onto the board row (`daily_operations`) when the
board is materialized. Rows imported before this existed are filled once by
`supabase/backfills/0018_booking_channel.sql`.

## Payment status derivation

At materialization time (`features/operations/logic/board.ts`), each
occupied cell's `outstanding_balance` (from the resolved reservation) drives
`payment_status`: `> 0` → `pending`, `== 0` → `paid`, no reservation/no
balance data → `null`. This is a controlled two-value vocabulary, matching
the pattern already used for `operational_status`/`breakfast_status` — the
UI translates it to Spanish labels at display time, it is not stored
translated.

## Known limitation: reservations without a reference

`reservations` is unique on `(hotel_id, reference, arrival_date, room_id)`
per the handoff's schema (§3.1). Postgres treats `NULL` as distinct from
`NULL` in unique constraints, so two rows for the same room and arrival date
that both lack a reference would **not** be recognized as the same
reservation on re-import. Not observed in the sample data (every real row
carries a `Reservation Number`), but not guarded against structurally.

## Confirmed working, unchanged

Quoted multi-room/multi-bed cells (e.g. `"Room 17,Room 16"`, or a single
reservation line listing all six bunks) and quoted guest names containing a
comma both parse and resolve correctly — this was true before this contract
lock and remains true after it. See `tests/unit/operations/room-resolver.test.ts`
and `tests/unit/operations/real-export-fixtures.test.ts`.
