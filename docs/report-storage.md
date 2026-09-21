# Report storage

Supabase owns operational data, events/tasks, staff assignments, immutable breakfast/housekeeping report snapshots, and shift report drafts/final reports.

Breakfast and housekeeping pages have an explicit Save report action and show their latest 30 saved versions. Copy/Print/WhatsApp by itself does not mark a report delivered or save a version. Shift reports are saved through Save draft or Confirm close.

The owner selected these existing destinations for Tours and Income:
- BOOKINGS INCOME: https://docs.google.com/spreadsheets/d/1cWSj5UfRDeME9nnYVp3N_DmkmN500FeFYcKAQr_jz6E/edit
- BOOKED TOURS: https://docs.google.com/spreadsheets/d/14CZDE7UpuA7jVgNjcgfpc6vNVccS2bTt6BswY1UhJX8/edit

Status: destination URLs supplied; authenticated schema inspection, server write credentials and delivery implementation still pending. The existing tour_bookings, income_entries and google_sheets_outbox records have NOT been removed or sent. Current forms still write there. Do not claim Sheets delivery until a write is verified. Cutover must preserve existing records, reconcile duplicates and map the actual destination columns and tabs. No payment-method field should be collected for a tour sale, because the travel office handles payment.

AI summary generation separately requires server-only OPENAI_API_KEY and OPENAI_MODEL in Vercel. Storage does not depend on AI activation.
