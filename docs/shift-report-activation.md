# Shift reports activation

The reception dashboard works with the existing operational tables. Report storage is separate and must be activated before closing shifts.

1. Apply `supabase/migrations/0015_shift_reports.sql` to the existing hotel project. It creates an RLS-protected report table, enforces the closing checklist, prevents edits after closing and audits writes. It does not alter reservations or payments.
2. Configure server-only `OPENAI_API_KEY` and `OPENAI_MODEL` in Vercel for the desired environments, then redeploy. Use a model available to the project that supports Responses API text generation. Never prefix the key with NEXT_PUBLIC.
3. Verify signed-in report draft save/reload, concurrent draft conflict, final close, and denied cross-hotel access. Run a sample AI draft and review factual accuracy before operational use.

The AI receives selected events, pending tasks, staff notes and daily operation/tour/income context. Its draft must be reviewed. Copy/Print/WhatsApp opens user-controlled sharing; nothing is sent automatically. Report text is English; the controls support English and Spanish. Closing stores an immutable handover report; it does not mark tasks completed or reconcile payments automatically.

Without AI configuration the report can be written manually. Without the migration the report screen explicitly disables storage and closing. Google Sheets delivery remains a separate pending integration: the existing outbox is not a confirmed delivery.

`0014_task_updates.sql` remains pending separately; apply before publishing the shared TaskEditor changes from the task-editing branch.
